import { nodemailerAdapter } from '@payloadcms/email-nodemailer'

export interface SendgridEmailOptions {
  /** Address emails are sent from — e.g. 'noreply@example.com' */
  fromAddress: string
  /** Display name — e.g. 'ECSA CMS' */
  fromName: string
  /** SendGrid API key. Defaults to process.env.SENDGRID_API_KEY. */
  apiKey?: string
}

/**
 * Returns a nodemailer email adapter pre-configured for SendGrid SMTP.
 *
 * SendGrid SMTP: the "user" is literally the string 'apikey' and the
 * "password" is your SendGrid API key.
 *
 * Usage in buildConfig: `email: sendgridEmail({ fromAddress, fromName })`
 */
export function sendgridEmail(options: SendgridEmailOptions) {
  const apiKey = options.apiKey ?? process.env.SENDGRID_API_KEY

  if (!apiKey) {
    throw new Error(
      '[sendgridEmail] SENDGRID_API_KEY is not set — email cannot be sent. ' +
        'Set it in your admin app .env file.',
    )
  }

  return nodemailerAdapter({
    defaultFromAddress: options.fromAddress,
    defaultFromName: options.fromName,
    transportOptions: {
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: apiKey,
      },
    },
  })
}
