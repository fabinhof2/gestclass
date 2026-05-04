import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  async sendInviteEmail(to: string, name: string, activationLink: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM,
        to,
        subject: 'Convite para acesso ao GestClass',
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
            <h2>Bem-vindo ao GestClass</h2>
            <p>Olá, <strong>${name}</strong>.</p>
            <p>Você recebeu um convite para acessar a plataforma GestClass.</p>
            <p>Clique no botão abaixo para ativar sua conta:</p>

            <p style="margin: 24px 0;">
              <a
                href="${activationLink}"
                style="
                  background: #2563eb;
                  color: white;
                  padding: 12px 20px;
                  text-decoration: none;
                  border-radius: 10px;
                  display: inline-block;
                  font-weight: bold;
                "
              >
                Ativar minha conta
              </a>
            </p>

            <p>Se o botão não funcionar, copie e cole este link no navegador:</p>
            <p>${activationLink}</p>

            <hr style="margin: 24px 0; border: none; border-top: 1px solid #e2e8f0;" />

            <p style="font-size: 14px; color: #475569;">
              Este convite foi enviado automaticamente pelo sistema GestClass.
            </p>
          </div>
        `,
      });

      return { success: true };
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      throw new InternalServerErrorException('Falha ao enviar e-mail');
    }
  }
}