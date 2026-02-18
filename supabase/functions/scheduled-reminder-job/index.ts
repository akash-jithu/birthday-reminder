// use Deno standard library URLs for edge function compatibility
import { serve } from "https://deno.land/std@0.201.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Production-grade scheduled job that is intended to be invoked by a
// Supabase Scheduled Function (cron job). It uses the service role key to
// query the database and Resend to dispatch emails. All sensitive keys are
// pulled from environment variables and never exposed to the frontend.

// environment variables are provided by Supabase runtime
// Deno global is available at runtime; no need to redeclare.
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const resendKey = Deno.env.get("RESEND_API_KEY");

if (!supabaseUrl || !supabaseKey || !resendKey) {
  console.error("Missing one of required env vars");
}

if (!supabaseUrl || !supabaseKey || !resendKey) {
  console.error("Missing one of required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// helper to send email via Resend REST API
async function sendResendEmail(to, subject, html) {
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "no-reply@birthday-reminder.app",
      to,
      subject,
      html,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${text}`);
  }
}

// build email HTML template
function emailTemplate(name, type, date) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Reminder Notification</title>
    <style>
      body { font-family: Arial, sans-serif; background:#f9f9f9; padding:20px; }
      .container { max-width:600px; margin:auto; background:#fff; padding:20px; border-radius:8px; }
      h1 { color:#333; }
      p { color:#555; }
      .footer { margin-top:20px; font-size:0.85rem; color:#999; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🎉 Reminder Notification</h1>
      <p>Hello,</p>
      <p>This is a reminder for:</p>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Occasion:</strong> ${type}</li>
        <li><strong>Date:</strong> ${date}</li>
      </ul>
      <p>Have a great day!</p>
      <div class="footer">&copy; Birthday Reminder</div>
    </div>
  </body>
</html>`;
}

serve(async (req: Request) => {
  // The function may be invoked manually or by schedule; we ignore the
  // incoming request body and run the job once.
  console.log("scheduled-reminder-job invoked");

  try {
    const now = new Date().toISOString();

    // fetch custom reminders that are due and not yet sent
    const { data: customRem, error: errorCustom } = await supabase
      .from("birthdays")
      .select("id,name,reminder_datetime,user_email,date_of_birth")
      .lte("reminder_datetime", now)
      .eq("reminder_sent", false)
      .not("reminder_datetime", "is", null)
      .limit(1000); // batch size

    if (errorCustom) {
      console.error("Error querying custom reminders", errorCustom);
    }

    // fetch birthday emails due today that haven't been sent
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: birthdayRem, error: errorBirthday } = await supabase
      .from("birthdays")
      .select("id,name,date_of_birth,user_email,birthday_email_sent")
      .eq("birthday_email_sent", false)
      .eq("date_of_birth", todayStr)
      .limit(1000);
    // Note: the above filter uses Postgres cast; if unsupported adjust accordingly.

    if (errorBirthday) {
      console.error("Error querying birthday reminders", errorBirthday);
    }

    // process custom reminders
    if (customRem && Array.isArray(customRem)) {
      for (const rec of customRem) {
        try {
          await sendResendEmail(
            rec.user_email,
            "🎉 Reminder Notification",
            emailTemplate(rec.name, "Reminder", rec.reminder_datetime)
          );
          await supabase
            .from("birthdays")
            .update({ reminder_sent: true })
            .eq("id", rec.id);
        } catch (err) {
          console.error("Failed to send custom reminder for id", rec.id, err);
        }
      }
    }

    // process birthday reminders
    if (birthdayRem && Array.isArray(birthdayRem)) {
      for (const rec of birthdayRem) {
        try {
          const formatted = new Date().toLocaleDateString();
          await sendResendEmail(
            rec.user_email,
            "🎉 Birthday Notification",
            emailTemplate(rec.name, "Birthday", formatted)
          );
          await supabase
            .from("birthdays")
            .update({ birthday_email_sent: true })
            .eq("id", rec.id);
        } catch (err) {
          console.error("Failed to send birthday email for id", rec.id, err);
        }
      }
    }

    // reset birthday_email_sent for records where date has passed
    const { error: resetErr } = await supabase
      .from("birthdays")
      .update({ birthday_email_sent: false })
      .neq("date_of_birth", todayStr)
      .eq("birthday_email_sent", true);
    if (resetErr) {
      console.error("Failed to reset birthday_email_sent flags", resetErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error("Unexpected error in scheduled job", err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      console.error("Unexpected error in scheduled job", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
});
