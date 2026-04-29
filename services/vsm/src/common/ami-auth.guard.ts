import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AmiAuthGuard implements CanActivate {
  private readonly token: string;

  constructor() {
    this.token = process.env['AMI_BRIDGE_TOKEN'] || '';
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth: string = request.headers['authorization'] || '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || token !== this.token) {
      throw new UnauthorizedException('Invalid AMI bridge token');
    }
    return true;
  }
}
