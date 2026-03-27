import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.0";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const APP_URL = Deno.env.get("APP_URL") || "https://nerdcon-planner.vercel.app";

    if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { name, email, company } = await req.json();

    if (!name || !email) {
      return new Response(JSON.stringify({ error: "Name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert attendee — if email exists, update name/company and regenerate token
    const token = crypto.randomUUID();
    const { data: attendee, error: dbError } = await supabase
      .from("attendees")
      .upsert(
        { name, email: email.toLowerCase().trim(), company: company || null, token },
        { onConflict: "email" }
      )
      .select()
      .single();

    if (dbError) throw dbError;

    const magicLink = `${APP_URL}/view?token=${attendee.token}`;

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NerdCon <onboarding@resend.dev>",
        to: [email],
        subject: "🎮 Your NerdCon Quest Access Link",
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020808;font-family:'Courier New',monospace;">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#0CEBF1;font-size:24px;letter-spacing:0.15em;margin:0;">FINTECH NERDCON</h1>
      <p style="color:#4a6a6a;font-size:12px;margin:8px 0 0;letter-spacing:0.1em;">SAN DIEGO · NOV 18-20, 2026</p>
    </div>
    <div style="background:#0a1212;border:1px solid #0a2a2a;border-radius:4px;padding:32px 24px;text-align:center;">
      <p style="color:#e0f0f0;font-size:16px;margin:0 0 8px;">Welcome, <strong style="color:#FFFBC9;">${name}</strong></p>
      <p style="color:#4a6a6a;font-size:13px;margin:0 0 32px;line-height:1.6;">
        Your quest awaits. Click below to access your personalized NerdCon agenda, save sessions, and register for roundtables.
      </p>
      <a href="${magicLink}" style="display:inline-block;background:#0CEBF1;color:#001a1a;font-size:14px;font-weight:bold;letter-spacing:0.1em;padding:14px 32px;border-radius:4px;text-decoration:none;">
        ACCESS MY QUEST ▸
      </a>
      <p style="color:#2a4a4a;font-size:11px;margin:24px 0 0;line-height:1.5;">
        This link is unique to you. Bookmark it to return to your quest anytime.
      </p>
    </div>
    <p style="color:#1a3a3a;font-size:10px;text-align:center;margin:24px 0 0;">
      Fintech NerdCon 2026 · San Diego Convention Center
    </p>
  </div>
</body>
</html>
        `,
        text: `Welcome to Fintech NerdCon, ${name}!\n\nAccess your quest here: ${magicLink}\n\nThis link is unique to you. Bookmark it to return anytime.\n\nFintech NerdCon 2026 · San Diego · Nov 18-20`,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      let resendError = errBody;
      try {
        const parsed = JSON.parse(errBody);
        resendError = parsed.message || parsed.error || errBody;
      } catch {}
      console.error("Resend error:", emailRes.status, resendError);
      // Still return the attendee — email failure shouldn't block registration
      return new Response(
        JSON.stringify({
          attendee,
          emailSent: false,
          error: `Resend ${emailRes.status}: ${resendError}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailData = await emailRes.json();
    console.log("Email sent successfully:", emailData.id);

    return new Response(
      JSON.stringify({ attendee, emailSent: true, emailId: emailData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    console.error("Edge function error:", errMsg, errStack);
    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
