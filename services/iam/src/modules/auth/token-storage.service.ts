import { Injectable } from '@nestjs/common';

/**
 * Token Storage Service
 *
 * Simple in-memory storage for refresh tokens and token blacklist.
 * TODO: Replace with Redis for production use in distributed systems.
 */
@Injectable()
export class TokenStorageService {
  // Store refresh tokens: Map<refreshToken, { userId, expiresAt }>
  private refreshTokens = new Map<string, { userId: string; expiresAt: number }>();

  // Store blacklisted access tokens: Map<accessToken, expiresAt>
  private blacklistedTokens = new Map<string, number>();

  // Store OAuth state tokens: Map<stateToken, expiresAt> — single-use, TTL 10 min
  private oauthStateTokens = new Map<string, number>();

  /**
   * Store refresh token
   */
  storeRefreshToken(refreshToken: string, userId: string, expiresAt: number): void {
    this.refreshTokens.set(refreshToken, { userId, expiresAt });

    // Auto cleanup expired tokens after expiration
    setTimeout(() => {
      this.refreshTokens.delete(refreshToken);
    }, expiresAt - Date.now());
  }

  /**
   * Validate and get userId from refresh token
   */
  validateRefreshToken(refreshToken: string): string | null {
    const tokenData = this.refreshTokens.get(refreshToken);

    if (!tokenData) {
      return null;
    }

    // Check if expired
    if (Date.now() > tokenData.expiresAt) {
      this.refreshTokens.delete(refreshToken);
      return null;
    }

    return tokenData.userId;
  }

  /**
   * Revoke refresh token (on logout or password change)
   */
  revokeRefreshToken(refreshToken: string): void {
    this.refreshTokens.delete(refreshToken);
  }

  /**
   * Revoke all refresh tokens for a user
   */
  revokeAllUserRefreshTokens(userId: string): void {
    for (const [token, data] of this.refreshTokens.entries()) {
      if (data.userId === userId) {
        this.refreshTokens.delete(token);
      }
    }
  }

  /**
   * Add access token to blacklist
   */
  blacklistAccessToken(accessToken: string, expiresAt: number): void {
    this.blacklistedTokens.set(accessToken, expiresAt);

    // Auto cleanup after expiration
    setTimeout(() => {
      this.blacklistedTokens.delete(accessToken);
    }, expiresAt - Date.now());
  }

  /**
   * Check if access token is blacklisted
   */
  isTokenBlacklisted(accessToken: string): boolean {
    const expiresAt = this.blacklistedTokens.get(accessToken);

    if (!expiresAt) {
      return false;
    }

    // Check if still valid blacklist period
    if (Date.now() > expiresAt) {
      this.blacklistedTokens.delete(accessToken);
      return false;
    }

    return true;
  }

  /**
   * Store an OAuth state token (single-use, TTL 10 minutes)
   */
  storeOAuthStateToken(stateToken: string): void {
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    this.oauthStateTokens.set(stateToken, expiresAt);

    // Auto cleanup after TTL
    setTimeout(() => {
      this.oauthStateTokens.delete(stateToken);
    }, 10 * 60 * 1000);
  }

  /**
   * Validate and consume an OAuth state token (single-use).
   * Returns true if valid and deletes it; returns false otherwise.
   */
  validateAndConsumeOAuthStateToken(stateToken: string): boolean {
    const expiresAt = this.oauthStateTokens.get(stateToken);

    if (!expiresAt) {
      return false;
    }

    if (Date.now() > expiresAt) {
      this.oauthStateTokens.delete(stateToken);
      return false;
    }

    // Single-use: delete on first successful validation
    this.oauthStateTokens.delete(stateToken);
    return true;
  }

  /**
   * Get storage stats (for debugging)
   */
  getStats() {
    return {
      refreshTokensCount: this.refreshTokens.size,
      blacklistedTokensCount: this.blacklistedTokens.size,
      oauthStateTokensCount: this.oauthStateTokens.size,
    };
  }
}
