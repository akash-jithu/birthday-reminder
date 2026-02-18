import { serve } from 'std/server';

// This is a minimal edge function that receives a JSON payload and sends an
// email via an external provider (e.g. SendGrid, Mailgun, etc.). You'll need to
// configure your own provider and credentials via environment variables.

serve(async (req) => {
  try {
    const { email, name, type, date } = await req.json();
    if (!email || !name || !type || !date) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
    }

    // TODO: Replace the following with real email-sending logic.
    // For example, using SendGrid:
    // await fetch('https://api.sendgrid.com/v3/mail/send', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     personalizations: [{ to: [{ email }] }],
    //     from: { email: 'no-reply@yourdomain.com' },
    //     subject: '🎉 Reminder Notification',
    //     content: [{ type: 'text/plain', value: `Hello,\n\nThis is a reminder for:\nName: ${name}\nOccasion: ${type}\nDate: ${date}\n\nHave a great day!` }]
    //   })
    // });

    // For now we simply log and return success.
    console.log('send-reminder-email called', { email, name, type, date });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Edge function error', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
