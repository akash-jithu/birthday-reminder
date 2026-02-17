/* ============================================
   SUPABASE CONFIG
============================================ */

const SUPABASE_URL = 'https://qpvgiygdvxsuzobpwxbh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwdmdpeWdkdnhzdXpvYnB3eGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjYyMjEsImV4cCI6MjA4NjA0MjIyMX0.4mTfL_Ucb0PhWPZnlRo7hCNC_w8a04w35G_zF1b8gqU';

// Get proper redirect URL for OAuth
// file:// protocol doesn't work with OAuth, so default to localhost in dev
function getOAuthRedirectUrl() {
    if (window.location.protocol === 'file:') {
        return 'http://localhost:8000';
    }
    return window.location.origin;
}

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

/* ============================================
   AUTH HELPERS
============================================ */

async function signInWithGoogle() {
    // For development: use getOAuthRedirectUrl() to handle file:// protocol
    // For production: use the actual origin
    // CRITICAL: This redirect URL MUST be registered in Supabase OAuth settingsssss
    const redirectUrl = getOAuthRedirectUrl();

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });

    if (error) {
        console.error('OAuth signIn error:', error);
        alert('Login failed. Ensure this redirect URL is registered in Supabase: ' + redirectUrl);
    }
    // Do NOT perform any manual window.location changes here.
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) console.error('Sign out error:', error);
}

// IMPORTANT: Use getSession() to restore session after OAuth redirect.
// getUser() can return null during the redirect processing, whereas
// getSession() gives the active session (if any).
async function getCurrentUser() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error('getSession error:', error);
        return null;
    }
    return session ? session.user : null;
}

/* ============================================
   DATABASE HELPERS
============================================ */

/* ============================================
   DATABASE HELPERS - CLEAN ARCHITECTURE
============================================ */

async function fetchUserBirthdays(userId) {
    console.log('📥 fetchUserBirthdays() called for userId:', userId);
    const { data, error } = await supabaseClient
        .from('birthdays')
        .select('*')
        .eq('user_id', userId);

    if (error) {
        console.error('❌ fetchUserBirthdays ERROR:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        return [];
    }
    console.log('✅ fetchUserBirthdays SUCCESS:', data?.length, 'records');
    return data;
}

// Insert birthday with ONLY required fields: name, date_of_birth
// All other fields are optional
async function insertBirthday(name, dateOfBirth, userId, optionalFields = {}) {
    console.log('📤 insertBirthday() called:', { name, dateOfBirth, userId, optionalFields });
    
    const payload = {
        user_id: userId,
        name: name.trim(),
        date_of_birth: dateOfBirth,
        ...optionalFields
    };

    const { data, error } = await supabaseClient
        .from('birthdays')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('❌ insertBirthday ERROR:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        showToast('Failed to add birthday: ' + (error.message || 'Unknown error'), 'error');
        return null;
    }
    console.log('✅ insertBirthday SUCCESS:', data);
    return data;
}

// Update birthday with ALL editable fields including date_of_birth
async function updateBirthday(id, updates = {}) {
    console.log('🔁 updateBirthday() called:', { id, updates });
    
    // Clean up updates object - only include non-empty values
    const cleanUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            cleanUpdates[key] = value;
        }
    });

    const { data, error } = await supabaseClient
        .from('birthdays')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('❌ updateBirthday ERROR:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        showToast('Failed to update birthday: ' + (error.message || 'Unknown error'), 'error');
        return null;
    }
    console.log('✅ updateBirthday SUCCESS:', data);
    return data;
}

async function removeBirthday(id) {
    console.log('🗑️ removeBirthday() called for id:', id);
    const { error } = await supabaseClient
        .from('birthdays')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('❌ removeBirthday ERROR:', {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint
        });
        showToast('Failed to delete birthday: ' + (error.message || 'Unknown error'), 'error');
        return false;
    }
    console.log('✅ removeBirthday SUCCESS');
    return true;
}

// Upload image to Supabase Storage
async function uploadImageFile(file) {
    if (!file) return null;
    try {
        const ext = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = `uploads/${fileName}`;

        const { data, error } = await supabaseClient.storage
            .from('birthday-images')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (error) {
            console.error('❌ uploadImageFile ERROR:', error);
            return null;
        }

        const publicRes = await supabaseClient.storage.from('birthday-images').getPublicUrl(filePath);
        let publicUrl = null;
        if (publicRes?.data) {
            publicUrl = publicRes.data.publicUrl || publicRes.data.publicURL || null;
        } else if (publicRes?.publicURL) {
            publicUrl = publicRes.publicURL;
        }

        if (!publicUrl) {
            console.error('❌ Could not obtain public URL for uploaded file', publicRes);
            return null;
        }
        return publicUrl;
    } catch (err) {
        console.error('❌ uploadImageFile EXCEPTION:', err);
        return null;
    }
}
