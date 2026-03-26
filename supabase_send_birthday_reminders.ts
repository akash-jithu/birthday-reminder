import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.18.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const resendFromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";

interface Birthday {
  id: string;
  user_id: string;
  name: string;
  date_of_birth: string;
  reminder_datetime: string | null;
  reminder_sent: boolean;
  birthday_email_sent: boolean;
}

interface UserEmail {
  id: string;
  email: string;
}

// Initialize Supabase client with service role key (backend-only, safe)
const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

// Helper: Get today's date in YYYY-MM-DD format
function getTodayISO(): string {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

// Helper: Safely evaluate if a date falls on today (Leap year safe)
function checkIsEventToday(dateString: string, todayISO: string): boolean {
  if (!dateString) return false;
  const [y, m, d] = dateString.split("T")[0].split("-");
  const todayDate = new Date(todayISO);
  
  // Safe JS interpretation (evaluates Feb 29 -> Mar 1 on non-leap years appropriately)
  const targetDate = new Date(todayDate.getFullYear(), Number(m) - 1, Number(d));
  
  return targetDate.getMonth() === todayDate.getMonth() && 
         targetDate.getDate() === todayDate.getDate();
}

// Helper: Send email via Resend with robust retries and error logging
async function sendEmailViaResend(
  recipientEmail: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  if (!resendApiKey) {
    console.warn("⚠️ RESEND_API_KEY not configured. Email not sent.");
    return false;
  }

  // Use raw string if it's the free testing tier domain, else format nicely
  const fromAddress = resendFromEmail === "onboarding@resend.dev"
    ? "onboarding@resend.dev"
    : `Birthday Reminder <${resendFromEmail}>`;

  let lastError = null;
  const maxRetries = 2; // 3 total attempts

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`✉️ Attempt ${attempt}/${maxRetries + 1} to send email to ${recipientEmail} from ${fromAddress}`);
      
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: recipientEmail,
          subject: subject,
          html: htmlContent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Email sent successfully to ${recipientEmail} (Resend ID: ${data.id || 'unknown'})`);
        return true;
      }

      // Log full failure API response deeply
      const errorText = await response.text();
      lastError = errorText;
      console.error(`❌ Resend API Error on attempt ${attempt} for ${recipientEmail}: Status ${response.status} - ${errorText}`);

      // Short delay before retry for rate limit/timeout buffers
      if (attempt <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`❌ Fetch/Network Exception on attempt ${attempt} for ${recipientEmail}:`, error);
      if (attempt <= maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
      }
    }
  }

  console.error(`🚨 Final Failure: Exhausted all retries. Could not send email to ${recipientEmail}. Last Error: ${lastError}`);
  return false;
}

// Generate HTML for birthday email
function generateBirthdayEmailHTML(name: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b, #4ecdc4); color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; border-radius: 8px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Birthday Reminder</h1>
          </div>
          <div class="content">
            <p>Today is <strong>${name}</strong>'s birthday!</p>
            <p>Don't forget to send them your wishes and celebrate this special day.</p>
          </div>
          <div class="footer">
            <p>Birthday Reminder App</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Generate HTML for custom reminder email
function generateReminderEmailHTML(name: string, reminderDate: string): string {
  const date = new Date(reminderDate);
  const dateStr = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #45b7d1, #96ceb4); color: white; padding: 20px; border-radius: 8px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; border-radius: 8px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Upcoming Birthday Reminder</h1>
          </div>
          <div class="content">
            <p>Reminder for <strong>${name}</strong>'s birthday on <strong>${dateStr}</strong>.</p>
            <p>Mark your calendar and prepare to celebrate!</p>
          </div>
          <div class="footer">
            <p>Birthday Reminder App</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

// Main function: Process all birthdays and send reminders
async function processBirthdayReminders() {
  console.log("🚀 Starting birthday reminder job...");

  try {
    // Fetch all birthdays from database
    const { data: birthdays, error: birthdayError } = await supabaseClient
      .from("birthdays")
      .select("*");

    if (birthdayError) {
      console.error("❌ Error fetching birthdays:", birthdayError);
      return;
    }

    if (!birthdays || birthdays.length === 0) {
      console.log("📭 No birthdays found in database");
      return;
    }

    console.log(`📅 Found ${birthdays.length} birthdays to check`);

    // PERF FIX: Fetch user mapping ONCE outside the loop to fix N+1 query issue
    const { data: authUsers, error: authError } = await supabaseClient.auth.admin.listUsers();
    if (authError || !authUsers) {
      console.error("❌ Error fetching auth users:", authError);
      return;
    }

    const userEmailMap = new Map<string, string>();
    authUsers.users.forEach((u: any) => {
      if (u.email) userEmailMap.set(u.id, u.email);
    });

    const todayISO = getTodayISO();
    let emailsSent = 0;
    const updateQueue: Array<{
      id: string;
      birthday_email_sent?: boolean;
      reminder_sent?: boolean;
    }> = [];

    // Collect batch tasks to prevent rate-limiting Resend API
    const emailTasks: Array<() => Promise<void>> = [];

    // Process each birthday
    for (const birthday of birthdays as Birthday[]) {
      try {
        const userEmail = userEmailMap.get(birthday.user_id);
        if (!userEmail) {
          console.warn(`⚠️ No email found for user ${birthday.user_id}, skipping birthday ${birthday.id}`);
          continue;
        }

        // Check if birthday occurs today (leap-year safe)
        if (checkIsEventToday(birthday.date_of_birth, todayISO) && !birthday.birthday_email_sent) {
          console.log(`🎂 Birthday today: ${birthday.name}`);
          
          emailTasks.push(async () => {
            const htmlContent = generateBirthdayEmailHTML(birthday.name);
            const emailSent = await sendEmailViaResend(userEmail, "🎉 Birthday Reminder", htmlContent);
            if (emailSent) {
              emailsSent++;
              updateQueue.push({ id: birthday.id, birthday_email_sent: true });
            }
          });
        }

        // Check if custom reminder occurs today (leap-year safe)
        if (birthday.reminder_datetime && !birthday.reminder_sent) {
          if (checkIsEventToday(birthday.reminder_datetime, todayISO)) {
            console.log(`🔔 Custom reminder today: ${birthday.name}`);
            
            emailTasks.push(async () => {
              const htmlContent = generateReminderEmailHTML(birthday.name, birthday.reminder_datetime!);
              const emailSent = await sendEmailViaResend(userEmail, "🔔 Upcoming Birthday Reminder", htmlContent);
              if (emailSent) {
                emailsSent++;
                updateQueue.push({ id: birthday.id, reminder_sent: true });
              }
            });
          }
        }
      } catch (error) {
        console.error(`❌ Error processing birthday ${birthday.id}:`, error);
      }
    }

    // Process email tasks in throttled batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < emailTasks.length; i += BATCH_SIZE) {
      const batch = emailTasks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((task) => task()));
      if (i + BATCH_SIZE < emailTasks.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Throttling protection
      }
    }

    // Batch update all sent statuses
    if (updateQueue.length > 0) {
      console.log(`📤 Updating ${updateQueue.length} birthday records...`);

      for (const update of updateQueue) {
        const { error: updateError } = await supabaseClient
          .from("birthdays")
          .update(update)
          .eq("id", update.id);

        if (updateError) {
          console.error(`❌ Error updating birthday ${update.id}:`, updateError);
        }
      }
    }

    console.log(`✅ Birthday reminder job complete. ${emailsSent} email(s) sent.`);
  } catch (error) {
    console.error("❌ Fatal error in birthday reminder job:", error);
  }
}

// Serve HTTP endpoint for manual triggering (for testing)
serve(async (req: any) => {
  // Verify request comes from Supabase scheduler
  const authHeader = req.headers.get("authorization");
  const expectedToken = Deno.env.get("SUPABASE_CRON_TOKEN") || "";

  // If token is configured, validate it
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    console.warn("❌ Unauthorized access attempt");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  // Run the reminder job
  await processBirthdayReminders();

  return new Response(
    JSON.stringify({ message: "Birthday reminder job completed" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
});
