import { Resend } from "resend";

type Env = {
  RESEND_API_KEY?: string;
  ALERT_FROM_EMAIL?: string;
  ALERT_FROM_NAME?: string;
};

type EnvLike = Env & Record<string, string | undefined>;

export function createResendClient(env: EnvLike = process.env as EnvLike): Resend {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY");
  }
  return new Resend(apiKey);
}

export async function sendPriceAlertEmail(params: {
  to: string;
  subject: string;
  html: string;
  env?: EnvLike;
}): Promise<void> {
  const resend = createResendClient(params.env);
  const fromEmail = params.env?.ALERT_FROM_EMAIL ?? process.env.ALERT_FROM_EMAIL;
  const fromName = params.env?.ALERT_FROM_NAME ?? process.env.ALERT_FROM_NAME;

  if (!fromEmail) {
    throw new Error("Missing ALERT_FROM_EMAIL");
  }

  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}
