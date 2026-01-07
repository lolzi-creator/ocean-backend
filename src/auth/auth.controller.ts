import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: { email: string; password: string; name?: string; role?: string }) {
    return this.authService.register(body.email, body.password, body.name, body.role);
  }

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('logout')
  logout(@Body() body: { access_token: string }) {
    return this.authService.logout(body.access_token);
  }

  @Post('reset-password')
  resetPassword(@Body() body: { email: string }) {
    return this.authService.resetPassword(body.email);
  }

  @Post('workers')
  getWorkers() {
    return this.authService.getWorkers();
  }

  @Post('verify-pin')
  verifyPin(@Body() body: { pin: string; userId?: string }) {
    return this.authService.verifyPin(body.pin, body.userId);
  }
}
