import { Injectable, Logger } from '@nestjs/common'
import envConfig from '../config'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)

  async sendInvitationEmail({
    to,
    companyName,
    role,
    inviteLink,
    locale,
  }: {
    to: string
    companyName: string
    role: string
    inviteLink: string
    locale?: string
  }): Promise<boolean> {
    const apiKey = envConfig.RESEND_API_KEY
    const fromEmail = envConfig.RESEND_FROM_EMAIL

    const LANGUAGE_CONTENT: Record<
      string,
      {
        subject: string
        heading: string
        body: string
        button: string
        fallbackText: string
        footer: string
      }
    > = {
      ru: {
        subject: `Приглашение в workspace ${companyName} — NSTORE CRM`,
        heading: `Вас пригласили в ${companyName}`,
        body: `Система управления клиентами компании <strong>${companyName}</strong> приглашает вас присоединиться к команде в роли <strong>${role}</strong>.`,
        button: 'Принять приглашение и создать аккаунт',
        fallbackText: 'Если кнопка выше не работает, скопируйте ссылку ниже и вставьте её в адресную строку браузера:',
        footer: `Это приглашение отправлено на адрес <strong>${to}</strong> и действительно в течение 7 дней с момента отправки. Если вы не ожидали этого приглашения, просто проигнорируйте это письмо.`,
      },
      en: {
        subject: `Invitation to join ${companyName} — NSTORE CRM`,
        heading: `You've been invited to join ${companyName}`,
        body: `<strong>${companyName}</strong>'s customer relationship management system is inviting you to join the team as a <strong>${role}</strong>.`,
        button: 'Accept invitation & set up account',
        fallbackText:
          "If the button above doesn't work, copy the link below and paste it into your browser's address bar:",
        footer: `This invitation was sent to <strong>${to}</strong> and is valid for 7 days from the date it was sent. If you weren't expecting this invitation, you can safely ignore this email.`,
      },
    }

    const content = LANGUAGE_CONTENT[locale ?? 'ru'] ?? LANGUAGE_CONTENT.ru
    const subject = content.subject
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F8F7; padding: 40px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; bg-color: #ffffff; background: #ffffff; border: 1px solid #E8E7E2; border-radius: 12px; padding: 32px; text-align: left; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">

          <!-- Header/Logo -->
          <div style="margin-bottom: 24px;">
            <span style="font-size: 18px; font-weight: 700; color: #534AB7; tracking-tight: -0.02em;">NSTORE <span style="color: #1A1A18; font-weight: 500;">CRM</span></span>
          </div>

          <!-- Main content -->
          <h2 style="font-size: 20px; font-weight: 600; color: #1A1A18; margin-top: 0; margin-bottom: 8px; line-height: 1.3;">
            ${content.heading}
          </h2>
          <p style="font-size: 14px; color: #6B6B67; line-height: 1.5; margin-bottom: 24px;">
            ${content.body}
          </p>

          <!-- Action Button -->
          <div style="margin-bottom: 24px;">
            <a href="${inviteLink}" target="_blank" style="display: inline-block; background-color: #534AB7; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 6px rgba(83, 74, 183, 0.15);">
              ${content.button}
            </a>
          </div>

          <p style="font-size: 12px; color: #9A9A95; line-height: 1.5; margin-bottom: 0;">
            ${content.fallbackText}<br/>
            <span style="color: #534AB7; word-break: break-all;">${inviteLink}</span>
          </p>

          <hr style="border: 0; border-top: 1px solid #E8E7E2; margin: 24px 0;" />

          <p style="font-size: 11px; color: #9A9A95; line-height: 1.4; margin: 0;">
            ${content.footer}
          </p>
        </div>
      </div>
    `

    // 1. If Resend Key is missing, fallback to logging
    if (!apiKey) {
      this.logger.warn(`[DEVELOPMENT] Resend API Key is missing. Logged invite Link:`)
      console.log(`\n==================================================`)
      console.log(`TO: ${to}`)
      console.log(`WORKSPACE: ${companyName}`)
      console.log(`ROLE: ${role}`)
      console.log(`INVITE LINK: ${inviteLink}`)
      console.log(`==================================================\n`)
      return true
    }

    // 2. Send via Resend API
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: subject,
          html: htmlContent,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        this.logger.error(`Resend API failed: ${JSON.stringify(errorData)}`)
        return false
      }

      this.logger.log(`Invitation email sent successfully to ${to}`)
      return true
    } catch (error) {
      this.logger.error(`Failed to send invitation email: ${error.message}`, error.stack)
      return false
    }
  }

  /**
   * Password reset email. `resetLink = null` means the account has no local
   * password (Google-only): the email then carries no link and tells the user
   * to sign in with Google instead.
   */
  async sendPasswordResetEmail({
    to,
    resetLink,
    locale,
  }: {
    to: string
    resetLink: string | null
    locale?: string
  }): Promise<boolean> {
    const apiKey = envConfig.RESEND_API_KEY
    const fromEmail = envConfig.RESEND_FROM_EMAIL

    const LANGUAGE_CONTENT: Record<
      string,
      {
        subject: string
        heading: string
        body: string
        googleBody: string
        button: string
        fallbackText: string
        footer: string
      }
    > = {
      ru: {
        subject: 'Сброс пароля — NSTORE CRM',
        heading: 'Сброс пароля',
        body: 'Мы получили запрос на сброс пароля для вашего аккаунта. Нажмите кнопку ниже, чтобы задать новый пароль.',
        googleBody:
          'Мы получили запрос на сброс пароля, но ваш аккаунт входит через Google и пароля у него нет. Используйте кнопку «Продолжить с Google» на странице входа.',
        button: 'Задать новый пароль',
        fallbackText: 'Если кнопка выше не работает, скопируйте ссылку ниже и вставьте её в адресную строку браузера:',
        footer: `Это письмо отправлено на адрес <strong>${to}</strong>. Ссылка действительна в течение 1 часа и может быть использована только один раз. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо — ваш пароль останется прежним.`,
      },
      en: {
        subject: 'Reset your password — NSTORE CRM',
        heading: 'Reset your password',
        body: 'We received a request to reset the password for your account. Click the button below to set a new password.',
        googleBody:
          'We received a request to reset your password, but your account signs in with Google and has no password. Use the "Continue with Google" button on the sign-in page.',
        button: 'Set a new password',
        fallbackText:
          "If the button above doesn't work, copy the link below and paste it into your browser's address bar:",
        footer: `This email was sent to <strong>${to}</strong>. The link is valid for 1 hour and can be used only once. If you didn't request a password reset, you can safely ignore this email — your password will stay the same.`,
      },
    }

    const content = LANGUAGE_CONTENT[locale ?? 'ru'] ?? LANGUAGE_CONTENT.ru
    const subject = content.subject
    const actionBlock = resetLink
      ? `
          <!-- Action Button -->
          <div style="margin-bottom: 24px;">
            <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #534AB7; color: #ffffff; text-decoration: none; padding: 12px 24px; font-size: 14px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 6px rgba(83, 74, 183, 0.15);">
              ${content.button}
            </a>
          </div>

          <p style="font-size: 12px; color: #9A9A95; line-height: 1.5; margin-bottom: 0;">
            ${content.fallbackText}<br/>
            <span style="color: #534AB7; word-break: break-all;">${resetLink}</span>
          </p>
        `
      : ''
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8F8F7; padding: 40px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background: #ffffff; border: 1px solid #E8E7E2; border-radius: 12px; padding: 32px; text-align: left; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">

          <!-- Header/Logo -->
          <div style="margin-bottom: 24px;">
            <span style="font-size: 18px; font-weight: 700; color: #534AB7;">NSTORE <span style="color: #1A1A18; font-weight: 500;">CRM</span></span>
          </div>

          <!-- Main content -->
          <h2 style="font-size: 20px; font-weight: 600; color: #1A1A18; margin-top: 0; margin-bottom: 8px; line-height: 1.3;">
            ${content.heading}
          </h2>
          <p style="font-size: 14px; color: #6B6B67; line-height: 1.5; margin-bottom: 24px;">
            ${resetLink ? content.body : content.googleBody}
          </p>
          ${actionBlock}

          <hr style="border: 0; border-top: 1px solid #E8E7E2; margin: 24px 0;" />

          <p style="font-size: 11px; color: #9A9A95; line-height: 1.4; margin: 0;">
            ${content.footer}
          </p>
        </div>
      </div>
    `

    // 1. If Resend Key is missing, fallback to logging (development only)
    if (!apiKey) {
      this.logger.warn(`[DEVELOPMENT] Resend API Key is missing. Logged password reset email:`)
      console.log(`\n==================================================`)
      console.log(`TO: ${to}`)
      console.log(`RESET LINK: ${resetLink ?? '(none — Google-only account)'}`)
      console.log(`==================================================\n`)
      return true
    }

    // 2. Send via Resend API
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject: subject,
          html: htmlContent,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        this.logger.error(`Resend API failed: ${JSON.stringify(errorData)}`)
        return false
      }

      this.logger.log(`Password reset email sent successfully to ${to}`)
      return true
    } catch (error) {
      this.logger.error(`Failed to send password reset email: ${error.message}`, error.stack)
      return false
    }
  }
}
