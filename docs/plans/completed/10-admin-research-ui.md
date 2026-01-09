# Phase 10: Admin & Research Management UI

## Status: Complete

## Overview

Two role-gated management areas with sidebar navigation, keeping the main app focused on conversation coaching.

| Route | Access | Purpose |
|-------|--------|---------|
| `/admin/*` | ADMIN only | User management, telemetry, system config |
| `/research/*` | STAFF+ | Invitations, sessions, observation notes |

Regular users see minimal UI (just conversation + home).

## Completed ✓

### Admin Area (`/admin/*`)
- `/admin/users` - User list with search, role filter
- `/admin/users/:id` - User detail + role editing
- `/admin/telemetry` - Telemetry dashboard
- `AdminLayout` + `AdminSidebar` with amber accents

### Research Area (`/research/*`)
- `/research/invitations` - Create/manage invitations (migrated from AdminPanel)
- `ResearchLayout` + `ResearchSidebar` with indigo accents

### Navigation
- `UserMenu` has sectioned navigation (Admin/Research) based on role
- Home page cleaned up - same minimal view for all users

### Backend
- `staffProcedure` for STAFF+ access control
- `user` router with list, get, updateRole

## Remaining

### Sessions Page (`/research/sessions`)
- List all conversation sessions (filterable by scenario, status, date)
- Click through to view session messages
- Add observation notes (ties into Phase 6 user testing)

### Future Enhancements
- `/admin/invitations` - System-wide invitation view (all creators)
- `/admin/settings` - System configuration (quota presets, etc.)
- QR code generation for invitation links (Phase 6)

## Key Files

```
packages/api/src/trpc/
  procedures.ts              # staffProcedure
  routers/user.ts           # User management

packages/app/src/
  layouts/
    AdminLayout.tsx
    ResearchLayout.tsx
  components/
    AdminSidebar.tsx
    ResearchSidebar.tsx
    RoleBadge.tsx
    UserMenu.tsx            # Sectioned navigation
  pages/
    admin/
      UserList.tsx
      UserDetail.tsx
      Telemetry.tsx
    research/
      InvitationList.tsx
    Home.tsx                # Cleaned up, no admin tools
```

## Design Decisions

1. **User-first home page**: Admins see the same experience as users. Management tools accessed via UserMenu, not cluttering the main view.

2. **Role-based sections in UserMenu**: Clear visual separation with titles and subtitles (e.g., "Admin - users, telemetry").

3. **Separate layouts**: Admin (amber) and Research (indigo) have distinct color schemes for quick visual context.

4. **GUEST/USER roles are automatic**: Based on OAuth identity status. Only STAFF/ADMIN roles are manually assigned.
