import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const { data: birthdays, error } = await supabase
    .from("birthdays")
    .select("*")
    .or(`birthday.eq.${todayStr},reminder_datetime.eq.${todayStr}`);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  for (const birthday of birthdays || []) {
    await resend.emails.send({
      from: "reminder@yourdomain.com",
      to: birthday.user_email,
      subject: `Reminder: ${birthday.name}'s Birthday`,
      html: `<p>Today is ${birthday.name}'s birthday 🎉</p>`
    });
  }

  return new Response("Reminders sent successfully");
});