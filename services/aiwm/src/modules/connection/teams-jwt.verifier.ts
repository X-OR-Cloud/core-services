import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Logger, UnauthorizedException } from '@nestjs/common';

/**
 * Microsoft Bot Framework JWT verification.
 *
 * Teams Bot Service signs every webhook POST with a Bearer JWT.
 * We verify:
 *   - Signature using Microsoft's public JWKS
 *   - aud === appId (our bot's Microsoft App ID)
 *   - iss is a trusted Microsoft issuer
 *   - exp / nbf (handled automatically by jose)
 */

const OPENID_CONFIG_URL =
  'https://login.botframework.com/v1/.well-known/openidconfiguration';

// Cache the JWKS fetcher — one per process lifetime
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let _jwksUrl: string | null = null;
const logger = new Logger('TeamsJwtVerifier');

const TRUSTED_ISSUERS = [
  'https://api.botframework.com',
  'https://sts.windows.net/',           // prefix — allow any tenant
  'https://login.microsoftonline.com/', // prefix — allow any tenant
];

async function getJwks(): Promise<ReturnType<typeof createRemoteJWKSet>> {
  if (_jwks) return _jwks;

  // Fetch OpenID config to get jwks_uri
  const res = await fetch(OPENID_CONFIG_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Teams OpenID config: ${res.status}`);
  }
  const config = await res.json() as { jwks_uri: string };
  _jwksUrl = config.jwks_uri;
  _jwks = createRemoteJWKSet(new URL(_jwksUrl));
  logger.debug(`Teams JWKS loaded from ${_jwksUrl}`);
  return _jwks;
}

/**
 * Verify a Teams webhook Authorization header.
 *
 * @param authorization  Raw Authorization header value (e.g. "Bearer eyJ...")
 * @param appId          Our bot's Microsoft App ID (from ConnectionConfig.appId)
 * @throws UnauthorizedException if invalid
 */
export async function verifyTeamsJwt(authorization: string, appId: string): Promise<void> {
  if (!authorization?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing or malformed Authorization header');
  }

  const token = authorization.slice(7);

  try {
    const jwks = await getJwks();
    const { payload } = await jwtVerify(token, jwks, {
      audience: appId,
      clockTolerance: 300, // 5 minutes — Microsoft recommends allowing up to 5 min skew
    });

    // Verify issuer is a Microsoft-trusted source
    const iss = payload.iss ?? '';
    const trusted = TRUSTED_ISSUERS.some((prefix) => iss === prefix || iss.startsWith(prefix));
    if (!trusted) {
      throw new UnauthorizedException(`Untrusted JWT issuer: ${iss}`);
    }
  } catch (err: any) {
    if (err instanceof UnauthorizedException) throw err;
    logger.warn(`Teams JWT verification failed: ${err.message}`);
    throw new UnauthorizedException('Invalid Teams JWT');
  }
}
