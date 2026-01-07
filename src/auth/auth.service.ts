import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
  ) {}

  async register(email: string, password: string, name?: string, role?: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.signUp({
        email,
        password,
      });

    if (error) {
      throw new BadRequestException(
        `Registrierung fehlgeschlagen: ${error.message}`,
      );
    }

    if (data.user) {
      await this.usersService.create({
        supabaseId: data.user.id,
        email: data.user.email!,
        name,
        role: role || 'worker',
      });
    }

    return {
      message: 'Registrierung erfolgreich. Bitte überprüfen Sie Ihre E-Mail.',
      user: data.user,
    };
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .auth.signInWithPassword({
        email,
        password,
      });

    if (error) {
      // Provide more specific error messages
      let errorMessage = 'Ungültige Anmeldedaten';
      
      if (error.message) {
        // Check for specific Supabase error messages
        if (error.message.includes('Invalid login credentials')) {
          errorMessage = 'Ungültige E-Mail oder Passwort';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'E-Mail nicht bestätigt. Bitte überprüfen Sie Ihre E-Mail und bestätigen Sie Ihr Konto.';
        } else if (error.message.includes('User not found')) {
          errorMessage = 'Benutzer nicht gefunden. Bitte registrieren Sie sich zuerst.';
        } else {
          errorMessage = `Anmeldung fehlgeschlagen: ${error.message}`;
        }
      }
      
      throw new UnauthorizedException(errorMessage);
    }

    // Check if email is confirmed
    if (data.user && !data.user.email_confirmed_at) {
      throw new UnauthorizedException(
        'E-Mail nicht bestätigt. Bitte überprüfen Sie Ihre E-Mail und bestätigen Sie Ihr Konto, bevor Sie sich anmelden.',
      );
    }

    return {
      message: 'Anmeldung erfolgreich',
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    };
  }

  async logout(accessToken: string) {
    const { error } = await this.supabaseService
      .getClient()
      .auth.signOut();

    if (error) {
      throw new BadRequestException('Abmeldung fehlgeschlagen');
    }

    return { message: 'Abmeldung erfolgreich' };
  }

  async resetPassword(email: string) {
    const { error } = await this.supabaseService
      .getClient()
      .auth.resetPasswordForEmail(email);

    if (error) {
      throw new BadRequestException(
        `Passwort-Zurücksetzung fehlgeschlagen: ${error.message}`,
      );
    }

    return {
      message: 'Passwort-Zurücksetzungs-E-Mail wurde gesendet. Bitte überprüfen Sie Ihre E-Mail.',
    };
  }

  async getWorkers() {
    return this.usersService.findAllWorkers();
  }

  async verifyPin(pin: string, userId?: string) {
    const user = await this.usersService.findByPin(pin, userId);
    
    if (!user) {
      throw new UnauthorizedException('Ungültiger PIN');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Benutzer ist deaktiviert');
    }

    return {
      message: 'PIN-Verifizierung erfolgreich',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }
}
