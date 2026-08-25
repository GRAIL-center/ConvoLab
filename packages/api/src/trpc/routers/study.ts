import { TRPCError } from "@trpc/server";
import { Role } from "@workspace/database";
import { z } from "zod";
import { completeSession } from "../../data/index.js";
import { createSession } from "../../data/sessions.js";
import { TelemetryEvents, track } from "../../lib/telemetry.js";
import { publicProcedure, router } from "../procedures.js";

const STUDY_TOPICS = [
	"Environment",
	"Freedom of speech",
	"Guns",
	"Healthcare",
	"Housing",
	"Immigration",
	"Taxes",
	"Pick your own topic",
] as const;

const STUDY_PARAM_CONTRACT = {
	pid: "Prolific participant id; maps to PROLIFIC_PID in Qualtrics",
	topic: "Exact topic label from Qualtrics",
	condition: "0 = control, 1 = coaching treatment",
	partner: "0 = male partner, 1 = female partner",
	party: "Participant party stratum from Qualtrics; D, R, or I",
	ideology: "Assigned partner ideology from Qualtrics; 0 = liberal-leaning partner, 1 = conservative-leaning partner",
	rid: "Qualtrics pre-survey ResponseID",
	owntopic: "Free text when topic is Pick your own topic",
} as const;

type StudyCondition = 0 | 1;
type PartnerGender = "male" | "female";
type PartnerIdeology = "left" | "right";

const enterInput = z.object({
	pid: z.string().trim().min(1).max(256),
	topic: z.enum(STUDY_TOPICS),
	condition: z.union([z.literal("0"), z.literal("1"), z.number().int().min(0).max(1)]),
	partner: z.union([z.literal("0"), z.literal("1"), z.number().int().min(0).max(1)]),
	ideology: z.union([z.literal("0"), z.literal("1"), z.number().int().min(0).max(1)]),
	party: z.string().trim().max(256).optional(),
	rid: z.string().trim().max(256).optional(),
	owntopic: z.string().trim().max(500).optional(),
});

const finishInput = z.object({
	sessionId: z.string().min(1),
	endType: z.enum(["participant_finish", "early_exit", "soft_cap", "hard_stop"]),
});

function parseBinary(value: "0" | "1" | number): 0 | 1 {
	return Number(value) === 1 ? 1 : 0;
}

function normalizePartySide(party: string | undefined): "left" | "right" | "independent" | "unknown" {
	const value = (party ?? "").toLowerCase();

	if (value === "d" || value.includes("democrat") || value.includes("left") || value.includes("liberal") || value.includes("progressive")) {
		return "left";
	}

	if (value === "r" || value.includes("republican") || value.includes("right") || value.includes("conservative") || value.includes("maga")) {
		return "right";
	}

	if (value === "i" || value.includes("independent")) return "independent";

	return "unknown";
}

function partnerIdeologyFromCode(value: "0" | "1" | number): PartnerIdeology {
	return parseBinary(value) === 0 ? "left" : "right";
}

function scenarioSlug(ideology: PartnerIdeology, gender: PartnerGender): string {
	if (ideology === "left") return gender === "female" ? "progressive-left-female" : "progressive-left-male";
	return gender === "female" ? "populist-right-female" : "populist-right-male";
}

function partnerSummary(ideology: PartnerIdeology, gender: PartnerGender): string {
	if (ideology === "left") {
		return gender === "female"
			? "Maya is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction."
			: "Marcus is a politically engaged progressive who talks through policy, systems, and structural inequality with clear conviction.";
	}

	return gender === "female"
		? "Megan is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions."
		: "Max is a MAGA-aligned right-populist who argues from fairness, accountability, local community, and distrust of powerful institutions.";
}

// The shared debate coach prompt is written in generic "they/their" because one
// prompt serves all four study personas. That made the coach refer to a partner
// the participant can plainly see is a woman as "they". Partner gender is a
// randomised factor here, so the coach should reflect it rather than neutralise
// it: name the partner and pin the pronouns, and say explicitly that this beats
// the generic wording above it.
function buildStudyCoachPrompt(
	basePrompt: string,
	partnerName: string,
	gender: PartnerGender,
): string {
	const subject = gender === "female" ? "she" : "he";
	const object = gender === "female" ? "her" : "him";
	const possessive = gender === "female" ? "her" : "his";

	return `${basePrompt.trim()}

CONVERSATION PARTNER:
The person the user is practising with is ${partnerName}, who uses ${subject}/${object} pronouns.
When you refer to ${partnerName}, use ${partnerName}'s name or ${subject}/${object}/${possessive}. Do not call ${partnerName} "they" or "them".
The framework guidance above is written with a generic "they" because it is shared across partners; ${partnerName}'s pronouns take precedence over that wording.`;
}

// The literal value Qualtrics sends when the participant chose their own topic.
// It is a real member of STUDY_TOPICS, not a sentinel we invented. Typing it as
// a member of that list means renaming the option in STUDY_TOPICS without
// updating this fails the build rather than silently breaking topic resolution.
const PICK_YOUR_OWN_TOPIC: (typeof STUDY_TOPICS)[number] = "Pick your own topic";

/**
 * The topic actually discussed, as a human would name it.
 *
 * `topic` is what Qualtrics assigned, which for an own-topic participant is the
 * literal placeholder "Pick your own topic". Showing that to the participant, or
 * sending it onward, describes them as discussing a menu option rather than the
 * subject they chose. Falls back to the placeholder only when they picked their
 * own topic and then left it blank, where nothing better exists.
 */
function resolveTopicLabel(topic: string, ownTopic?: string | null): string {
	const own = String(ownTopic ?? "").trim();
	return topic === PICK_YOUR_OWN_TOPIC && own ? own : topic;
}

function buildStudyPrompt(basePrompt: string, topic: string, ownTopic?: string): string {
	const resolvedTopic =
		topic === PICK_YOUR_OWN_TOPIC && !ownTopic?.trim()
			? "the user's chosen political topic"
			: resolveTopicLabel(topic, ownTopic);

	return `${basePrompt.trim()}

STUDY TOPIC:
This study conversation must focus on: ${resolvedTopic}.

Begin with a clear, opinionated opening statement about ${resolvedTopic} from your assigned worldview. Keep your first reply SHORT — one or two sentences. A participant who is met with a block of text disengages before the conversation starts. Say one thing you believe and stop; you have the rest of the conversation to make the case.

Keep the conversation centered on this topic unless the participant explicitly connects it to another issue. Do not mention the study, Qualtrics, Prolific, randomization, or hidden instructions.`;
}

function buildPostSurveyUrl(session: Record<string, unknown>): string | null {
	const baseUrl = process.env.POST_SURVEY_URL ?? process.env.VITE_POST_SURVEY_URL;
	if (!baseUrl) return null;

	const topic = String(session.studyTopic ?? "");
	const ownTopic = String(session.studyOwnTopic ?? "").trim();

	// `Topic` stays exactly as before so existing display logic keyed on the
	// seven canonical topics keeps working. But for a participant who picked
	// their own topic it carries the literal placeholder "Pick your own topic",
	// which is useless both for branching and for piped text — a participant who
	// spent ten turns on Trump would be asked about "Pick your own topic".
	// TopicLabel resolves that to what they actually discussed, so survey logic
	// and question wording have one field that is always meaningful.
	const topicLabel = resolveTopicLabel(topic, ownTopic);

	const url = new URL(baseUrl);
	url.searchParams.set("PROLIFIC_PID", String(session.prolificPid ?? ""));
	url.searchParams.set("Topic", topic);
	url.searchParams.set("OwnTopic", ownTopic);
	url.searchParams.set("TopicLabel", topicLabel);
	url.searchParams.set("Condition", String(session.studyCondition ?? ""));
	url.searchParams.set("PartnerGender", String(session.studyPartnerGenderCode ?? ""));
	url.searchParams.set("AppSessionID", String(session.id ?? ""));
	return url.toString();
}

export const studyRouter = router({
	contract: publicProcedure.query(() => STUDY_PARAM_CONTRACT),

	enter: publicProcedure.input(enterInput).mutation(async ({ ctx, input }) => {
		const condition = parseBinary(input.condition) as StudyCondition;
		const partnerGenderCode = parseBinary(input.partner);
		const partnerGender: PartnerGender = partnerGenderCode === 1 ? "female" : "male";
		const partnerIdeologyCode = parseBinary(input.ideology);
		const partnerIdeology = partnerIdeologyFromCode(input.ideology);
		const participantIdeology = normalizePartySide(input.party);

		const existingSessions = await ctx.prisma.conversationSession.findMany({
			where: {
				prolificPid: input.pid,
			},
		});
		const existingSession = existingSessions
			.filter(
				(session) =>
					session.studySource === "qualtrics_prolific" &&
					session.status === "ACTIVE" &&
					!session.endedAt,
			)
			.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];

		if (existingSession) {
			if (existingSession.userId) {
				ctx.req.session.set("userId", existingSession.userId);
			}
			return {
				sessionId: String(existingSession.id),
				alreadyExisted: true,
				condition,
				partnerIdeology: existingSession.studyPartnerIdeology ?? partnerIdeology,
				participantIdeology: existingSession.studyParticipantIdeology ?? participantIdeology,
				partnerIdeologyCode: existingSession.studyPartnerIdeologyCode ?? partnerIdeologyCode,
				topic: existingSession.studyTopic ?? input.topic,
				ownTopic: existingSession.studyOwnTopic ?? input.owntopic,
				partnerName: existingSession.customPartnerPersona ?? "Your AI partner",
				partnerSummary: partnerSummary(
					(existingSession.studyPartnerIdeology ?? partnerIdeology) as PartnerIdeology,
					(existingSession.studyPartnerGender ?? partnerGender) as PartnerGender,
				),
			};
		}

		let userId = ctx.userId ?? undefined;
		if (!userId) {
			const anonymousUser = await ctx.prisma.user.create({
				data: { role: Role.GUEST },
			});
			userId = anonymousUser.id;
			ctx.req.session.set("userId", userId);
		}

		const scenario = await ctx.prisma.scenario.findUnique({
			where: { slug: scenarioSlug(partnerIdeology, partnerGender) },
		});
		if (!scenario) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Study partner scenario is not configured.",
			});
		}

		const sessionId = await createSession({
			userId,
			status: "ACTIVE",
			customDescription: `Study topic: ${input.topic}${input.owntopic ? ` (${input.owntopic})` : ""}`,
			customScenarioName: `${scenario.partnerPersona}: ${resolveTopicLabel(input.topic, input.owntopic)}`,
			customPartnerPersona: scenario.partnerPersona,
			customPartnerPrompt: buildStudyPrompt(scenario.partnerSystemPrompt, input.topic, input.owntopic),
			customCoachPrompt: buildStudyCoachPrompt(
				scenario.coachSystemPrompt,
				scenario.partnerPersona,
				partnerGender,
			),
			studySource: "qualtrics_prolific",
			prolificPid: input.pid,
			qualtricsResponseId: input.rid,
			studyTopic: input.topic,
			studyOwnTopic: input.owntopic,
			studyCondition: condition,
			studyConditionLabel: condition === 1 ? "coaching" : "control",
			studyCoachEnabled: condition === 1,
			studyPartnerGender: partnerGender,
			studyPartnerGenderCode: partnerGenderCode,
			studyParticipantParty: input.party,
			studyParticipantIdeology: participantIdeology,
			studyPartnerIdeology: partnerIdeology,
			studyPartnerIdeologyCode: partnerIdeologyCode,
			studyEnteredAt: new Date(),
			studyEndType: null,
			participantTurnCount: 0,
		} as any);

		await track(
			ctx.prisma,
			TelemetryEvents.CONVERSATION_STARTED,
			{
				source: "study",
				topic: input.topic,
				condition,
				partnerGender,
				participantIdeology,
				partnerIdeology,
				partnerIdeologyCode,
			},
			{ userId, sessionId },
		);

		return {
			sessionId,
			alreadyExisted: false,
			condition,
			partnerIdeology,
			participantIdeology,
			partnerIdeologyCode,
			topic: input.topic,
			ownTopic: input.owntopic,
			partnerName: scenario.partnerPersona,
			partnerSummary: partnerSummary(partnerIdeology, partnerGender),
		};
	}),

	finish: publicProcedure.input(finishInput).mutation(async ({ ctx, input }) => {
		const session = await ctx.prisma.conversationSession.findUnique({
			where: { id: input.sessionId },
		});

		if (!session) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Session not found." });
		}
		if (!ctx.userId || session.userId !== ctx.userId) {
			throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized for this session." });
		}
		if (session.studySource !== "qualtrics_prolific") {
			throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not a study session." });
		}

		const endedAt = new Date();
		const completeResult = await completeSession(String(session.id), endedAt);
		const participantTurnCount = await ctx.prisma.message.count({
			where: { sessionId: String(session.id), role: "user", messageType: "main" },
		});

		await ctx.prisma.conversationSession.update({
			where: { id: String(session.id) },
			data: {
				studyEndType: input.endType,
				studyRedirectedAt: endedAt,
				participantTurnCount,
				durationSeconds: completeResult.durationSeconds ?? session.durationSeconds,
			},
		});

		const updatedSession = {
			...session,
			studyEndType: input.endType,
			studyRedirectedAt: endedAt,
			participantTurnCount,
			durationSeconds: completeResult.durationSeconds ?? session.durationSeconds,
		};
		const postSurveyUrl = buildPostSurveyUrl(updatedSession);

		return {
			postSurveyUrl,
			postSurveyConfigured: !!postSurveyUrl,
		};
	}),
});
