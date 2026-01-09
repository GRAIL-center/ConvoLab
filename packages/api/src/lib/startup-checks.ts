/**
 * Startup validation and diagnostic logging.
 *
 * Helps new developers identify common configuration issues
 * before they hit cryptic runtime errors.
 */

interface DiagnosticResult {
  canStart: boolean;
  errors: string[];
  warnings: string[];
}

const DIVIDER = '─'.repeat(60);

/**
 * Check if .env file was likely not copied from .env.example.
 *
 * Docker Compose interpolates ${VAR} as empty strings when .env is missing.
 * We detect this by checking if multiple critical vars are all empty.
 */
function detectMissingEnvFile(): boolean {
  const criticalVars = [
    'SESSION_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'ANTHROPIC_API_KEY',
  ];

  const emptyCount = criticalVars.filter((v) => !process.env[v]).length;

  // If 3+ critical vars are empty, .env was likely not created
  return emptyCount >= 3;
}

/**
 * Run all startup checks and return diagnostic results.
 */
export function runStartupChecks(): DiagnosticResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isDev = process.env.NODE_ENV !== 'production';
  const envFileMissing = detectMissingEnvFile();

  // Check for missing .env file
  if (envFileMissing) {
    const message =
      'It looks like you haven\'t created a .env file.\n' +
      '  Run: cp .env.example .env\n' +
      '  Then edit .env to add your API keys and secrets.\n' +
      '  See the setup guide at http://localhost:5173 for details.';

    if (isDev) {
      // In dev mode, warn but continue so frontend can show setup guide
      warnings.push(message);
    } else {
      errors.push(message);
      // In production, stop checking - nothing will work
      return { canStart: false, errors, warnings };
    }
  }

  // Session key
  if (!process.env.SESSION_KEY) {
    if (isDev) {
      warnings.push(
        'SESSION_KEY not set - auth features disabled.\n' +
          '  Generate one with: openssl rand -hex 32'
      );
    } else {
      errors.push(
        'SESSION_KEY is required in production.\n' +
          '  Generate one with: openssl rand -hex 32'
      );
    }
  }

  // Google OAuth
  const googleVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL'];
  const missingGoogle = googleVars.filter((v) => !process.env[v]);

  if (missingGoogle.length > 0 && missingGoogle.length < googleVars.length) {
    // Partial config - probably a mistake
    warnings.push(
      `Incomplete Google OAuth config: missing ${missingGoogle.join(', ')}.\n` +
        '  OAuth login will not work. Set all three or remove all.'
    );
  } else if (missingGoogle.length === googleVars.length) {
    warnings.push(
      'Google OAuth not configured.\n' +
        '  Users won\'t be able to sign in. Get credentials from:\n' +
        '  https://console.cloud.google.com/apis/credentials'
    );
  }

  // AI API Keys - check which are available
  const aiKeys = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    google: !!process.env.GOOGLE_AI_API_KEY,
  };

  const configuredProviders = Object.entries(aiKeys)
    .filter(([, configured]) => configured)
    .map(([name]) => name);

  if (configuredProviders.length === 0) {
    const message =
      'No AI API keys configured. At least one is required:\n' +
      '  - ANTHROPIC_API_KEY (recommended) - https://console.anthropic.com/\n' +
      '  - OPENAI_API_KEY - https://platform.openai.com/api-keys\n' +
      '  - GOOGLE_AI_API_KEY - https://aistudio.google.com/apikey\n' +
      '\n' +
      '  The app currently defaults to Anthropic Claude models.\n' +
      '  Set ANTHROPIC_API_KEY to get started.';

    if (isDev && envFileMissing) {
      // Already warned about missing .env, don't double-warn
    } else if (isDev) {
      warnings.push(message);
    } else {
      errors.push(message);
    }
  } else if (!aiKeys.anthropic) {
    warnings.push(
      'ANTHROPIC_API_KEY not set.\n' +
        `  Configured providers: ${configuredProviders.join(', ')}\n` +
        '  Note: Default scenarios use Claude. If you only have OpenAI/Google keys,\n' +
        '  you\'ll need to create custom scenarios specifying those providers.'
    );
  }

  // Database URL
  if (!process.env.DATABASE_URL) {
    errors.push(
      'DATABASE_URL not set.\n' +
        '  If using Docker: this should be set in compose.yml\n' +
        '  If running locally: set it in .env'
    );
  }

  return {
    canStart: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log startup diagnostics and exit if critical errors found.
 *
 * In development mode, the server will start even with configuration errors
 * so the frontend can display the setup guide to help developers.
 */
export function logStartupDiagnostics(log: {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}): void {
  const result = runStartupChecks();
  const isDev = process.env.NODE_ENV !== 'production';

  // Log errors
  if (result.errors.length > 0) {
    log.error('\n' + DIVIDER);
    log.error('CONFIGURATION ERRORS');
    log.error(DIVIDER);
    for (const error of result.errors) {
      log.error('\n' + error);
    }
    log.error('\n' + DIVIDER + '\n');
  }

  // Log warnings
  if (result.warnings.length > 0) {
    log.warn('\n' + DIVIDER);
    log.warn('CONFIGURATION WARNINGS');
    log.warn(DIVIDER);
    for (const warning of result.warnings) {
      log.warn('\n' + warning);
    }
    log.warn('\n' + DIVIDER + '\n');
  }

  // Exit if critical errors (production only)
  if (!result.canStart) {
    if (isDev) {
      log.warn('Server starting with configuration errors (dev mode).');
      log.warn('Visit http://localhost:5173 for the setup guide.');
    } else {
      log.error('Server cannot start due to configuration errors above.');
      process.exit(1);
    }
  }

  // Success message
  if (result.errors.length === 0 && result.warnings.length === 0) {
    log.info('Environment configuration OK');
  }
}

/**
 * Get a summary of configured AI providers for logging.
 */
export function getAIProviderSummary(): string {
  const providers: string[] = [];

  if (process.env.ANTHROPIC_API_KEY) providers.push('Anthropic');
  if (process.env.OPENAI_API_KEY) providers.push('OpenAI');
  if (process.env.GOOGLE_AI_API_KEY) providers.push('Google AI');

  if (providers.length === 0) return 'None configured';
  return providers.join(', ');
}
