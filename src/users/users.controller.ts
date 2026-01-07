import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body()
    createUserDto: {
      supabaseId: string;
      email: string;
      name?: string;
      role?: string;
    },
  ) {
    return this.usersService.create(createUserDto, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body()
    updateUserDto: {
      name?: string;
      role?: string;
      isActive?: boolean;
      hourlyRate?: number;
    },
  ) {
    return this.usersService.update(id, updateUserDto, user.id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.usersService.remove(id, user.id);
  }
}
