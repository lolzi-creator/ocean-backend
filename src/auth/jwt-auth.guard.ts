import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Kein Authentifizierungs-Token gefunden');
    }

    const token = authHeader.replace('Bearer ', '');

    // ALWAYS try to find user by ID first (for PIN-authenticated workers)
    // UUIDs are 36 characters long with dashes
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
    
    if (isUUID) {
      try {
        const user = await this.usersService.findOne(token);
        if (user && user.isActive) {
          request.user = user;
          return true;
        }
        if (user && !user.isActive) {
          throw new UnauthorizedException('Benutzer ist deaktiviert');
        }
      } catch (e: any) {
        // If NotFoundException, user doesn't exist - continue to Supabase validation
        // If UnauthorizedException, re-throw it
        if (e instanceof UnauthorizedException) {
          throw e;
        }
        // For UUIDs, if user not found, don't try Supabase (it's definitely a worker ID)
        throw new UnauthorizedException('Ungültiger Worker-Token');
      }
    }

    // Token is not a UUID or user not found by ID, try to validate as Supabase JWT token
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .auth.getUser(token);

      if (error || !data.user) {
        throw new UnauthorizedException('Ungültiges Token');
      }

      // Get user from our database
      const user = await this.usersService.findBySupabaseId(data.user.id);

      if (!user) {
        throw new UnauthorizedException('Benutzer nicht gefunden');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Benutzer ist deaktiviert');
      }

      // Attach user to request
      request.user = user;
      return true;
    } catch (supabaseError: any) {
      if (supabaseError instanceof UnauthorizedException) {
        throw supabaseError;
      }
      throw new UnauthorizedException('Token-Validierung fehlgeschlagen');
    }
  }
}
