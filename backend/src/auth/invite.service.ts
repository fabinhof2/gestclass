import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class InviteService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async inviteUser(
    currentUser: {
      userId: string;
      role: UserRole;
      schoolId?: string | null;
    },
    data: {
      name: string;
      email: string;
      role: UserRole;
    },
  ) {
    if (!data.name || !data.name.trim()) {
      throw new BadRequestException('Nome é obrigatório');
    }

    if (!data.email || !data.email.trim()) {
      throw new BadRequestException('E-mail é obrigatório');
    }

    if (!data.role) {
      throw new BadRequestException('Perfil é obrigatório');
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(normalizedEmail);

    if (existingUser) {
      throw new BadRequestException('Já existe usuário com este e-mail');
    }

    if (
      currentUser.role !== 'ADMIN_ESCOLA' &&
      currentUser.role !== 'SUPERUSUARIO'
    ) {
      throw new ForbiddenException('Sem permissão para convidar usuários');
    }

    if (currentUser.role === 'ADMIN_ESCOLA' && !currentUser.schoolId) {
      throw new ForbiddenException('Admin sem escola vinculada');
    }

    if (currentUser.role === 'ADMIN_ESCOLA') {
      const allowedRolesForAdmin: UserRole[] = [
        'GESTOR',
        'PROFESSOR',
        'RESPONSAVEL',
        'ALUNO',
      ];

      if (!allowedRolesForAdmin.includes(data.role)) {
        throw new ForbiddenException(
          'Admin da escola só pode convidar GESTOR, PROFESSOR, RESPONSAVEL ou ALUNO',
        );
      }
    }

    const temporaryPassword = randomUUID().replace(/-/g, '').slice(0, 10);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const activationToken = randomUUID();

    const activationExpires = new Date();
    activationExpires.setDate(activationExpires.getDate() + 2);

    const schoolId =
      currentUser.role === 'SUPERUSUARIO'
        ? undefined
        : currentUser.schoolId || undefined;

    const user = await this.usersService.create({
      name: data.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: data.role,
      schoolId,
      activationToken,
      activationExpires,
      isActivated: false,
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const activationLink = `${frontendUrl}/ativar?token=${activationToken}`;

    await this.mailService.sendInviteEmail(
      normalizedEmail,
      data.name.trim(),
      activationLink,
    );

    return {
      message: 'Convite enviado com sucesso',
      invitedUser: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        isActivated: user.isActivated,
        activationExpires,
      },
    };
  }
}