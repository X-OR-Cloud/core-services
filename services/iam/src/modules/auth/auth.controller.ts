import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  UseGuards,
  Request,
  Res,
  Req,
  Query,
  UsePipes,
  ValidationPipe,
  Headers,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginData, ChangeUserPasswordData, RefreshTokenData, UpdateProfileDto, ProfileResponseDto, NodeLoginDto, NodeTokenData } from './auth.dto';
import { TokenData } from './auth.entity';
import { JwtAuthGuard } from '@hydrabyte/base';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'User login', description: 'Authenticate user and return JWT tokens' })
  @ApiResponse({ status: 200, description: 'Login successful', type: TokenData })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async login(@Body() data: LoginData): Promise<TokenData> {
    return this.authService.login(data);
  }

  @Get('verify-token')
  @ApiOperation({ summary: 'Verify JWT token', description: 'Validate if JWT token is valid' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Token is valid' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  @UseGuards(JwtAuthGuard)
  async verifyToken(@Request() req): Promise<{
    valid: boolean;
    user: any;
  }> {
    // Nếu đến được đây nghĩa là token hợp lệ (đã qua JwtAuthGuard)
    return {
      valid: true,
      user: req.user, // req.user được set bởi JwtStrategy.validate()
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile', description: 'Get current authenticated user profile' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully', type: ProfileResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req): Promise<ProfileResponseDto> {
    const userId = req.user.sub || req.user.userId;
    return this.authService.getProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile', description: 'Update current user profile (fullname, phonenumbers, address only)' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Profile updated successfully', type: ProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async updateProfile(
    @Body() updateData: UpdateProfileDto,
    @Request() req
  ): Promise<ProfileResponseDto> {
    const userId = req.user.sub || req.user.userId;
    return this.authService.updateProfile(userId, updateData);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Change password', description: 'Change password for authenticated user' })
  @ApiBearerAuth('JWT-auth')
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized or invalid old password' })
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async changePassword(
    @Body() data: ChangeUserPasswordData,
    @Request() req
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.sub || req.user.userId;
    return this.authService.changePassword(
      userId,
      data.oldPassword,
      data.newPassword
    );
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token', description: 'Get new access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully', type: TokenData })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async refreshToken(@Body() data: RefreshTokenData): Promise<TokenData> {
    return this.authService.refreshToken(data.refreshToken);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout', description: 'Invalidate access token and refresh token' })
  @ApiBearerAuth('JWT-auth')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string', description: 'Optional refresh token to revoke' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  async logout(
    @Request() req,
    @Headers('authorization') authHeader: string,
    @Body() body: { refreshToken?: string }
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.sub || req.user.userId;

    // Extract access token from Authorization header
    const accessToken = authHeader?.replace('Bearer ', '') || '';

    return this.authService.logout(accessToken, body.refreshToken, userId);
  }

  @Post('node')
  @ApiOperation({ summary: 'Node authentication', description: 'Authenticate node and return JWT token' })
  @ApiResponse({ status: 200, description: 'Node authentication successful', type: NodeTokenData })
  @ApiResponse({ status: 401, description: 'Invalid node credentials' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async nodeLogin(@Body() dto: NodeLoginDto): Promise<NodeTokenData> {
    return this.authService.nodeLogin(dto);
  }

  @Get('google')
  @ApiOperation({ summary: 'Google SSO login', description: 'Redirect to Google OAuth 2.0. Pass ?appId=<id> for App-based domain validation.' })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  async googleAuth(
    @Query('appId') appId: string,
    @Res() res: Response,
  ): Promise<void> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');
    const state = appId ? Buffer.from(JSON.stringify({ appId })).toString('base64') : '';
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', clientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', 'openid email profile');
    if (state) googleAuthUrl.searchParams.set('state', state);
    return res.redirect(googleAuthUrl.toString()) as any;
  }

  @Get('google/callback')
  @ApiOperation({ summary: 'Google SSO callback', description: 'Handle Google OAuth 2.0 callback and redirect to frontend' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend with tokens or error' })
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('state') state: string,
  ): Promise<void> {
    const feBaseUrl = this.configService.get<string>('FE_BASE_URL') || '';

    let appId: string | undefined;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        appId = decoded.appId;
      } catch { /* state không phải format của chúng ta */ }
    }

    try {
      const result = await this.authService.handleGoogleCallback((req as any).user as any, appId);
      if ('error' in result) {
        return res.redirect(`${feBaseUrl}/login?error=${result.error}`) as any;
      }
      const redirectUrl = new URL(`${feBaseUrl}/auth/callback`);
      redirectUrl.searchParams.set('token', result.accessToken);
      redirectUrl.searchParams.set('refreshToken', result.refreshToken);
      return res.redirect(redirectUrl.toString()) as any;
    } catch (error) {
      this.logger.error('Google OAuth callback error', { message: error.message });
      return res.redirect(`${feBaseUrl}/login?error=google_service_unavailable`) as any;
    }
  }
}
