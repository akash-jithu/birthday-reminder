/* ============================================
   MODELS
============================================ */

class Birthday {
    constructor(id, name, dateOfBirth, optionalFields = {}) {
        this.id = id;
        this.name = name;
        this.dateOfBirth = dateOfBirth; // yyyy-mm-dd
        this.nickname = optionalFields.nickname || '';
        this.imageUrl = optionalFields.imageUrl || null;
        this.notes = optionalFields.notes || '';
        // Handle reminder preferences - can be array or will default to empty
        if (Array.isArray(optionalFields.reminderPreferences)) {
            this.reminderPreferences = optionalFields.reminderPreferences.map(n => Number(n));
        } else if (optionalFields.reminderPreferences) {
            this.reminderPreferences = [Number(optionalFields.reminderPreferences)];
        } else {
            this.reminderPreferences = [];
        }
    }

    getNextOccurrence() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [, m, d] = this.dateOfBirth.split('-');
        let next = new Date(today.getFullYear(), m - 1, d);

        if (next < today) {
            next = new Date(today.getFullYear() + 1, m - 1, d);
        }
        return next;
    }

    getDaysUntil() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.ceil(
            (this.getNextOccurrence() - today) / (1000 * 3600 * 24)
        );
    }

    isToday() {
        const today = new Date();
        const [, m, d] = this.dateOfBirth.split('-');
        return today.getMonth() === m - 1 && today.getDate() === Number(d);
    }

    // Date when reminder should fire for the next occurrence
    getReminderDate() {
        const next = this.getNextOccurrence();
        // returns array of reminder dates per preference
        return this.reminderPreferences.map(days => {
            const r = new Date(next);
            r.setDate(r.getDate() - Number(days));
            r.setHours(0,0,0,0);
            return r;
        });
    }

    isReminderDueToday() {
        const today = new Date();
        today.setHours(0,0,0,0);
        const remDates = this.getReminderDate();
        return remDates.some(rd => rd.getTime() === today.getTime());
    }

    getAge() {
        const dob = new Date(this.dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        if (
            today.getMonth() < dob.getMonth() ||
            (today.getMonth() === dob.getMonth() &&
                today.getDate() < dob.getDate())
        ) {
            age--;
        }
        return age;
    }
}

/* ============================================
   STATE
============================================ */

let currentUser = null;
let birthdayManager = null;
let appInitialized = false; // Guard to prevent duplicate initialization
let currentFilter = 'all'; // Track current filter: 'all', 'today', 'upcoming'
let currentSearchQuery = ''; // Track current search query
let currentViewMode = 'list'; // 'list' or 'calendar'
let currentSort = 'upcoming'; // 'upcoming', 'alphabetical'
let accentColor = localStorage.getItem('accentColor') || '#ff6b6b';

// pending deletions map: id -> {item, index, timer}
const pendingDeletions = new Map();

// track shown notifications to avoid duplicates
const shownNotifications = new Set();

// track confetti shown today
const confettiShown = new Set();

/* ============================================
   DOM ELEMENTS
============================================ */

// Auth elements
const authContainer = document.getElementById('authContainer');
const appContainer = document.getElementById('appContainer');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const darkModeToggle = document.getElementById('darkModeToggle');

// Form elements
const birthdayForm = document.getElementById('birthdayForm');
const nameInput = document.getElementById('nameInput');
const dateInput = document.getElementById('dateInput');

// Summary elements
const totalBirthdays = document.getElementById('totalBirthdays');
const nextBirthday = document.getElementById('nextBirthday');
const todayBirthdays = document.getElementById('todayBirthdays');

// List elements
const birthdayList = document.getElementById('birthdayList');

/* ============================================
   AUTH FLOW
============================================ */

async function initAuth() {
    // Show loading while we check for an existing session
    showLoadingIndicator();

    try {
        // Use getSession() directly from supabase client to reliably
        // restore sessions after OAuth redirect.
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) {
            console.error('getSession error during initAuth:', error);
        }

        if (session && session.user) {
            // Session exists — restore user and initialize app once
            currentUser = session.user;
            showApp();
            await initApp();
        } else {
            // No active session — show auth UI
            currentUser = null;
            showAuth();
        }
    } catch (err) {
        console.error('Error checking session:', err);
        showAuth();
    } finally {
        hideLoadingIndicator();
    }

    // Attach a single auth state change listener to handle future
    // sign-in / sign-out events. It must NOT reinitialize the app
    // if it's already initialized for the current session.
    supabaseClient.auth.onAuthStateChange(async (event, payload) => {
        try {
            if (event === 'SIGNED_IN' && payload?.session?.user) {
                currentUser = payload.session.user;
                showApp();
                if (!appInitialized) {
                    await initApp();
                }
            } else if (event === 'SIGNED_OUT') {
                // Clear state on sign-out
                currentUser = null;
                appInitialized = false;
                birthdayManager = null;
                showAuth();
            }
            // Ignore other events to avoid duplicate inits
        } catch (e) {
            console.error('onAuthStateChange handler error:', e);
        }
    });
}

/* ============================================
   UI VISIBILITY
============================================ */

function showAuth() {
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
}

function showApp() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

function showLoadingIndicator() {
    const loader = document.querySelector('.loading-indicator');
    if (loader) loader.style.display = 'flex';
}

function hideLoadingIndicator() {
    const loader = document.querySelector('.loading-indicator');
    if (loader) loader.style.display = 'none';
}

function getMetrics() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const thisMonth = birthdayManager.filter(b => {
        const [, m] = b.dateOfBirth.split('-');
        return Number(m) === currentMonth;
    }).length;
    const next7 = birthdayManager.filter(b => {
        const d = b.getDaysUntil();
        return d > 0 && d <= 7;
    }).length;
    return { thisMonth, next7 };
}

// Generate consistent avatar color from name hash
function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash = hash & hash;
    }
    const colors = [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7',
        '#dfe6e9', '#a29bfe', '#fd79a8', '#fdcb6e', '#6c5ce7'
    ];
    return colors[Math.abs(hash) % colors.length];
}

// Get milestone badge if applicable
function getMilestoneBadge(age) {
    if (age === 18) return { text: 'Adult', emoji: '👤' };
    if (age === 21) return { text: 'Special', emoji: '⭐' };
    if (age === 50) return { text: 'Golden', emoji: '🏆' };
    if (age === 60) return { text: 'Diamond', emoji: '💎' };
    return null;
}

// Format date nicely
function formatDate(isoDate) {
    const [year, month, day] = isoDate.split('-');
    return `${day}-${month}-${year}`;
}

async function initApp() {
    birthdayManager = [];

    try {
        const data = await fetchUserBirthdays(currentUser.id);
        birthdayManager = data.map(b => new Birthday(
            b.id,
            b.name,
            b.date_of_birth,
            {
                nickname: b.nickname,
                imageUrl: b.image_url,
                notes: b.notes,
                reminderPreferences: b.reminder_preferences
            }
        ));
    } catch (err) {
        console.error('failed fetching birthdays in initApp:', err);
    }

    // Initialize theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark');
    }

    try {
        render();
    } catch (e) {
        console.error('render error in initApp:', e);
    }
    // After rendering, check for any reminders due today
    try {
        checkRemindersOnLoad();
    } catch (e) {
        console.error('checkRemindersOnLoad error:', e);
    }
}

/* ============================================
   UI RENDERING
============================================ */

function render() {
    try {
        renderSummary();
    } catch (e) {
        console.error('renderSummary error in render():', e);
    }

    try {
        if (currentViewMode === 'calendar') {
            renderCalendar();
        } else {
            renderList();
        }
    } catch (e) {
        console.error('render view error:', e);
    }

    try {
        renderTimeline();
    } catch (e) {
        console.error('renderTimeline error:', e);
    }
}

function renderSummary() {
    try {
        if (totalBirthdays) totalBirthdays.textContent = birthdayManager.length;
        if (todayBirthdays) todayBirthdays.textContent = birthdayManager.filter(b => b.isToday()).length;

        const next = [...birthdayManager].sort(
            (a, b) => a.getDaysUntil() - b.getDaysUntil()
        )[0];

        if (nextBirthday) {
            nextBirthday.textContent = next
                ? `${next.name} (${next.getDaysUntil()} days)`
                : 'None';
        }
    } catch (err) {
        console.error('renderSummary failed:', err);
        // silently continue, elements may be missing
    }
}

function renderList() {
    const container = document.getElementById('birthdayList');
    if (!container) return;
    
    // Show list view, hide calendar view
    const calendarContainer = document.getElementById('birthdayCalendar');
    if (calendarContainer) calendarContainer.style.display = 'none';
    container.style.display = 'block';
    
    container.innerHTML = '';

    if (birthdayManager.length === 0) {
        container.innerHTML = '<p>No birthdays yet</p>';
        return;
    }

    // Sort
    let sorted = [...birthdayManager];
    if (currentSort === 'alphabetical') {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        sorted.sort((a, b) => a.getDaysUntil() - b.getDaysUntil());
    }

    // Apply search filter
    if (currentSearchQuery.trim()) {
        const query = currentSearchQuery.toLowerCase();
        sorted = sorted.filter(b => 
            b.name.toLowerCase().includes(query) || 
            (b.nickname && b.nickname.toLowerCase().includes(query))
        );
    }

    // Apply time filter
    if (currentFilter === 'today') {
        sorted = sorted.filter(b => b.isToday());
    } else if (currentFilter === 'upcoming') {
        sorted = sorted.filter(b => b.getDaysUntil() <= 7 && b.getDaysUntil() > 0);
    } else if (currentFilter === 'thismonth') {
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        sorted = sorted.filter(b => {
            const [, m] = b.dateOfBirth.split('-');
            return Number(m) === currentMonth;
        });
    }

    if (sorted.length === 0) {
        container.innerHTML = '<p class="empty-message">No birthdays match your filters.</p>';
        return;
    }

    sorted.forEach(b => {
        const daysUntil = b.getDaysUntil();
        const age = b.getAge();
        const nextAge = age + (daysUntil === 0 ? 1 : 0);
        const milestone = getMilestoneBadge(nextAge);
        
        const avatarColor = getAvatarColor(b.name);
        const avatar = `<div class="avatar" style="background: ${avatarColor}">${b.name.charAt(0).toUpperCase()}</div>`;
        
        let countdownText = daysUntil === 0 ? 'Today! 🎉' : `Turns ${nextAge+1} in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
        let countdownClass = '';
        if (daysUntil === 0) {
            countdownClass = 'countdown-today';
        } else if (daysUntil <= 3) {
            countdownClass = 'countdown-soon';
        } else if (daysUntil <= 7) {
            countdownClass = 'countdown-week';
        }

        const div = document.createElement('div');
        div.className = 'birthday-item' + (b.isToday() ? ' today' : '');
        div.dataset.id = b.id;

        const nickDisplay = b.nickname ? `<span class="nickname">(${b.nickname})</span>` : '';
        const milestoneHtml = milestone ? `<span class="milestone-badge" title="${milestone.text}">${milestone.emoji}</span>` : '';
        
        div.innerHTML = `
            <div class="birthday-card-content">
                <div class="birthday-card-header">
                    ${avatar}
                    <div class="birthday-info">
                        <strong class="birthday-name">${b.name} ${nickDisplay} ${milestoneHtml}</strong>
                        <div class="birthday-date">DOB: ${formatDate(b.dateOfBirth)}</div>
                        <div class="birthday-meta">Age: ${age} • <span class="countdown ${countdownClass}">${countdownText}</span></div>
                    </div>
                </div>
                <div class="birthday-actions">
                    <button class="small-btn btn-share" title="Share">📤</button>
                    <button class="small-btn btn-edit" title="Edit">✏️</button>
                    <button class="small-btn btn-delete" title="Delete">🗑️</button>
                </div>
            </div>
        `;

        // Share button
        div.querySelector('.btn-share').onclick = () => {
            const msg = `🎉 Happy Birthday ${b.name}! Wishing you a fantastic year ahead!`;
            const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
            navigator.clipboard.writeText(msg).then(() => {
                showToast('Message copied!', 'success');
            }).catch(() => {
                window.open(whatsappUrl, '_blank');
            });
        };

        // Delete button
        div.querySelector('.btn-delete').onclick = () => {
            doSoftDelete(b);
        };

        // Edit button  
        div.querySelector('.btn-edit').onclick = () => {
            // existing edit logic
            const editArea = document.createElement('div');
            editArea.className = 'edit-area';
            editArea.innerHTML = `
                <div style="display: grid; gap: 0.7rem;">
                    <input type="text" class="edit-name" placeholder="Name" value="${escapeHtml(b.name)}" required>
                    <input type="date" class="edit-date" value="${b.dateOfBirth}" required>
                    <input type="text" class="edit-nickname" placeholder="Nickname (optional)" value="${escapeHtml(b.nickname || '')}">
                    <textarea class="edit-notes" placeholder="Notes (optional)" rows="2">${escapeHtml(b.notes || '')}</textarea>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="small-btn btn-save" style="flex:1;">Save</button>
                        <button class="small-btn btn-cancel" style="flex:1;">Cancel</button>
                    </div>
                </div>
            `;
            div.appendChild(editArea);

            editArea.querySelector('.btn-cancel').onclick = () => { editArea.remove(); };
            editArea.querySelector('.btn-save').onclick = async () => {
                const nameInput = editArea.querySelector('.edit-name');
                const dateInput = editArea.querySelector('.edit-date');
                const nicknameInput = editArea.querySelector('.edit-nickname');
                const notesInput = editArea.querySelector('.edit-notes');

                if (!nameInput.value.trim() || !dateInput.value) {
                    showToast('Name and date are required', 'error');
                    return;
                }

                const updateObj = {
                    name: nameInput.value.trim(),
                    date_of_birth: dateInput.value,
                    nickname: nicknameInput.value || null,
                    notes: notesInput.value || null
                };

                const updated = await updateBirthday(b.id, updateObj);
                if (updated) {
                    b.name = updated.name;
                    b.dateOfBirth = updated.date_of_birth;
                    b.nickname = updated.nickname || '';
                    b.notes = updated.notes || '';
                    showToast('Birthday updated!', 'success');
                    updateAllViews();
                }
            };
        };

        container.appendChild(div);
        
        // Trigger confetti for today's birthdays (but only once per session)
        if (daysUntil === 0 && !confettiShown.has(b.id)) {
            setTimeout(() => {
                spawnConfetti();
                confettiShown.add(b.id);
            }, 100);
        }
    });
}

function renderCalendar() {
    const container = document.getElementById('birthdayCalendar');
    if (!container) return;
    
    // Hide list view, show calendar view
    const listContainer = document.getElementById('birthdayList');
    if (listContainer) listContainer.style.display = 'none';
    container.style.display = 'block';
    
    container.innerHTML = '';
    
    if (birthdayManager.length === 0) {
        container.innerHTML = '<p class="empty-message">No birthdays yet. Add one to get started!</p>';
        return;
    }

    // Get current month and year
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11
    
    // Create month header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    const monthHeader = document.createElement('h3');
    monthHeader.className = 'calendar-month-header';
    monthHeader.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    container.appendChild(monthHeader);
    
    // Create day headers
    const dayHeaderRow = document.createElement('div');
    dayHeaderRow.className = 'calendar-day-headers';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(day => {
        const headerCell = document.createElement('div');
        headerCell.className = 'calendar-day-header';
        headerCell.textContent = day;
        dayHeaderRow.appendChild(headerCell);
    });
    container.appendChild(dayHeaderRow);
    
    // Create calendar grid
    const calendarGrid = document.createElement('div');
    calendarGrid.className = 'calendar-grid';
    
    // Get first day of month and number of days
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'calendar-cell empty';
        calendarGrid.appendChild(emptyCell);
    }
    
    // Add cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateCell = document.createElement('div');
        dateCell.className = 'calendar-cell';
        
        // Check if this day has any birthdays
        const dayDate = new Date(currentYear, currentMonth, day);
        const dayString = dayDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        const birthdaysOnDay = birthdayManager.filter(b => {
            const [year, month, dayPart] = b.dateOfBirth.split('-');
            const birthMonth = parseInt(month);
            const birthDay = parseInt(dayPart);
            return birthMonth === currentMonth + 1 && birthDay === day;
        });
        
        // Build cell content
        const dayNumber = document.createElement('div');
        dayNumber.className = 'calendar-day-number';
        dayNumber.textContent = day;
        dateCell.appendChild(dayNumber);
        
        // Add birthday names
        if (birthdaysOnDay.length > 0) {
            dateCell.classList.add('has-birthday');
            birthdaysOnDay.forEach(b => {
                const nameDiv = document.createElement('div');
                nameDiv.className = 'calendar-birthday-name';
                const age = b.getAge();
                nameDiv.textContent = `${b.name} (${age})`;
                nameDiv.title = `${b.name} turns ${age + 1}`;
                dateCell.appendChild(nameDiv);
            });
        }
        
        // Highlight today
        if (day === today.getDate() && currentMonth === today.getMonth()) {
            dateCell.classList.add('today');
        }
        
        calendarGrid.appendChild(dateCell);
    }
    
    container.appendChild(calendarGrid);
}

function renderTimeline() {
    const container = document.getElementById('upcomingTimeline');
    if (!container) return;
    const upcoming = [...birthdayManager].filter(b => b.getDaysUntil() <= 30).sort((a,b)=>a.getDaysUntil()-b.getDaysUntil());
    container.innerHTML = '';
    if (upcoming.length === 0) {
        container.innerHTML = '<p class="empty-message">No upcoming birthdays in the next 30 days.</p>';
        return;
    }
    upcoming.forEach(b => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `<div>${b.name} • ${b.dateOfBirth}</div><div>${b.getDaysUntil()} days • Remind: ${b.reminderPreferences.join(', ')}d</div>`;
        container.appendChild(item);
    });
}

function renderInsights() {
    const thisMonthCount = document.getElementById('thisMonthCount');
    const next30Count = document.getElementById('next30Count');
    const commonMonth = document.getElementById('commonMonth');
    const avgAge = document.getElementById('avgAge');
    if (!birthdayManager || birthdayManager.length === 0) {
        if (thisMonthCount) thisMonthCount.textContent = '0';
        if (next30Count) next30Count.textContent = '0';
        if (commonMonth) commonMonth.textContent = '—';
        if (avgAge) avgAge.textContent = '—';
        return;
    }
    const today = new Date();
    const month = today.getMonth() + 1;
    const thisMonth = birthdayManager.filter(b => new Date(b.dateOfBirth).getMonth() + 1 === month).length;
    const next30 = birthdayManager.filter(b => b.getDaysUntil() <= 30).length;
    const months = {}; let sumAge=0;
    birthdayManager.forEach(b => {
        const m = new Date(b.dateOfBirth).getMonth() + 1;
        months[m] = (months[m] || 0) + 1;
        sumAge += b.getAge();
    });
    const mostCommon = Object.keys(months).reduce((a,b)=> months[a] > months[b] ? a : b, Object.keys(months)[0]);
    const avg = Math.round(sumAge / birthdayManager.length) || '—';
    if (thisMonthCount) thisMonthCount.textContent = String(thisMonth);
    if (next30Count) next30Count.textContent = String(next30);
    if (commonMonth) commonMonth.textContent = (mostCommon ? new Date(2000, mostCommon-1,1).toLocaleString('default',{month:'long'}) : '—');
    if (avgAge) avgAge.textContent = String(avg === '—' ? '—' : `${avg} yrs`);
}

function updateAllViews() {
    render();
    renderTimeline();
    renderInsights();
}

/* ============================================
   HELPERS
============================================ */

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ============================================
   EVENTS
============================================ */

/* ============================================
   EVENTS
============================================ */

darkModeToggle.onclick = () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    showToast(isDark ? '🌙 Dark mode' : '☀️ Light mode', 'success');
};

googleLoginBtn.onclick = signInWithGoogle;
logoutBtn.onclick = signOut;

// Search functionality
document.getElementById('searchInput')?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    updateAllViews();
});

// Filter functionality
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remove active class from all buttons
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        e.target.classList.add('active');
        // Update filter
        currentFilter = e.target.dataset.filter;
        updateAllViews();
    });
});

// Sort functionality
document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    updateAllViews();
});

// View toggle functionality
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Remove active class from all buttons
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        e.target.classList.add('active');
        // Update view mode
        currentViewMode = e.target.dataset.view;
        updateAllViews();
    });
});

birthdayForm.onsubmit = async e => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const dateOfBirth = dateInput.value;

    // ONLY validate required fields
    if (!name || !dateOfBirth) {
        showToast('Name and Date of Birth are required', 'error');
        return;
    }

    // Collect optional fields
    const notes = document.getElementById('notesInput')?.value || '';
    const nickname = document.getElementById('nicknameInput')?.value || '';
    const reminderDays = Number(document.getElementById('reminderSelect')?.value || 0);

    

    // Build optional fields object
    const optionalFields = {};
    if (nickname) optionalFields.nickname = nickname;
    if (notes) optionalFields.notes = notes;
    if (reminderDays > 0) optionalFields.reminderPreferences = [reminderDays];

    // Insert with ONLY required fields + optional fields
    const result = await insertBirthday(name, dateOfBirth, currentUser.id, optionalFields);
    if (result) {
        birthdayManager.push(
            new Birthday(result.id, result.name, result.date_of_birth, {
                nickname: result.nickname,
                imageUrl: result.image_url,
                notes: result.notes,
                reminderPreferences: result.reminder_preferences
            })
        );
        birthdayForm.reset();
        showToast('Birthday added successfully!', 'success');
        updateAllViews();
    }
};

/* ============================================
   START
============================================ */

// Check URL for OAuth error parameters after redirect and display
// a helpful message before initializing auth. This avoids confusing
// "site not reachable" states and guides the developer to fix
// OAuth provider configuration (redirect URIs / client secret).
function handleOAuthErrorFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search || window.location.hash.replace('#', '?'));
        const err = params.get('error') || params.get('error_description');
        const errDesc = params.get('error_description');
        if (err || errDesc) {
            const decoded = errDesc ? decodeURIComponent(errDesc) : err;
            const message = `OAuth error: ${decoded}\n\nPossible causes:\n- Supabase Google provider not configured with Client ID/Secret\n- Google OAuth redirect URI not set to Supabase callback (https://<your-project>.supabase.co/auth/v1/callback)\n- The redirect URL you used (${window.location.origin}) is not listed in Supabase Redirect URLs\n\nCheck Supabase Auth settings and Google Cloud OAuth client settings.`;
            console.error('OAuth redirect error:', decoded);
            alert(message);

            // Clean URL to remove error params so user isn't stuck on error page
            try {
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            } catch (e) {
                // ignore
            }
        }
    } catch (e) {
        console.error('Error parsing OAuth error from URL:', e);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // restore theme immediately (so auth screen respects it)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark');
    }

    // restore any existing Supabase session
    try {
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error) console.error('Error fetching session on load:', error);
        if (session && session.user) {
            currentUser = session.user;
            showApp();
            if (!appInitialized) {
                await initApp();
            }
        } else {
            showAuth();
        }
    } catch (err) {
        console.error('Session check failed:', err);
        showAuth();
    }

    // listen for auth state changes and update UI
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session && session.user) {
            currentUser = session.user;
            showApp();
            if (!appInitialized) initApp();
        } else {
            currentUser = null;
            appInitialized = false;
            birthdayManager = null;
            showAuth();
        }
    });

    handleOAuthErrorFromUrl();
    // request permission for notifications
    requestNotificationPermission();
});

/* ============================================
   TOASTS & CONFETTI
============================================ */

function showToast(message, type = 'default', timeout = 5000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'success' ? 'success' : (type === 'error' ? 'error' : ''));
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 400);
    }, timeout);
}

// notification helpers
function requestNotificationPermission() {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
        Notification.requestPermission().catch(e => console.warn('Notification permission error', e));
    }
}

function sendBirthdayNotification(name, message) {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const key = `${name}|${message}`;
    if (shownNotifications.has(key)) return;
    try {
        new Notification('Birthday Reminder', { body: message });
        shownNotifications.add(key);
    } catch (e) {
        console.error('notification error', e);
    }
}

// reusable toast with undo button; onUndoCallback invoked if user clicks within timeout
function showUndoToast(message, onUndoCallback, timeout = 5000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }
    const t = document.createElement('div');
    t.className = 'toast undo';
    t.innerHTML = `${message} <button class="undo-btn">Undo</button>`;
    container.appendChild(t);
    let handled = false;
    const btn = t.querySelector('.undo-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (handled) return;
            handled = true;
            try { onUndoCallback && onUndoCallback(); } catch (e) { console.error('undo callback error', e); }
            t.remove();
        });
    }
    setTimeout(() => {
        if (!handled) t.remove();
    }, timeout);
}

// perform soft-delete: remove from UI then wait 5s before actual DB removal
function doSoftDelete(birthday) {
    const idx = birthdayManager.findIndex(x => x.id === birthday.id);
    if (idx === -1) return;
    // remove from manager and refresh immediately
    birthdayManager.splice(idx, 1);
    updateAllViews();

    const record = { item: birthday, index: idx, timer: null };
    record.timer = setTimeout(async () => {
        try {
            await removeBirthday(birthday.id);
        } catch (e) {
            console.error('Error during permanent delete', e);
        }
        pendingDeletions.delete(birthday.id);
    }, 5000);
    pendingDeletions.set(birthday.id, record);

    showUndoToast('Birthday deleted', () => {
        const rec = pendingDeletions.get(birthday.id);
        if (!rec) return;
        clearTimeout(rec.timer);
        pendingDeletions.delete(birthday.id);
        // restore at original position if possible
        if (rec.index >= 0 && rec.index <= birthdayManager.length) {
            birthdayManager.splice(rec.index, 0, rec.item);
        } else {
            birthdayManager.push(rec.item);
        }
        updateAllViews();
    });
}

function spawnConfetti(count = 30) {
    let parent = document.getElementById('confettiContainer');
    if (!parent) {
        parent = document.createElement('div');
        parent.id = 'confettiContainer';
        document.body.appendChild(parent);
    }
    for (let i=0;i<count;i++) {
        const el = document.createElement('div');
        el.className = 'confetti-piece';
        el.style.left = Math.random()*100 + '%';
        el.style.background = `hsl(${Math.random()*360},70%,60%)`;
        el.style.animationDelay = (Math.random()*0.5)+'s';
        el.style.transform = `rotate(${Math.random()*360}deg)`;
        parent.appendChild(el);
        setTimeout(()=> el.remove(), 3000);
    }
}

/* ============================================
   EXPORT / IMPORT
============================================ */

function exportAsJSON() {
    const payload = birthdayManager.map(b => ({
        name: b.name,
        date_of_birth: b.dateOfBirth,
        nickname: b.nickname,
        notes: b.notes,
        reminder_preferences: b.reminderPreferences,
        image_url: b.imageUrl
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'birthdays-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('✅ JSON export complete', 'success');
}

function exportAsTXT() {
    const lines = birthdayManager.map(b => {
        const d = new Date(b.dateOfBirth);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${b.name} - ${dd}-${mm}-${yyyy}`;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'birthdays-backup.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('✅ TXT export complete', 'success');
}

// wire up export buttons
document.getElementById('exportJsonBtn')?.addEventListener('click', exportAsJSON);
document.getElementById('exportTxtBtn')?.addEventListener('click', exportAsTXT);

// Wire up the new importFileBtn to trigger file input
document.getElementById('importFileBtn')?.addEventListener('click', () => {
    document.getElementById('importFileInput')?.click();
});

/* ============================================
   FILE IMPORT WITH SMART PARSING
============================================ */

// Set up PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Extract birthday entries from unstructured PDF text
// Returns array of separate {name, date_of_birth} objects - ONE PER PERSON
function extractBirthdaysFromText(text) {
    const items = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // Regex patterns to match dates (YYYY-MM-DD, MM/DD/YYYY, etc.)
    const datePatterns = [
        /(\d{4}-\d{2}-\d{2})/,  // YYYY-MM-DD
        /(\d{1,2}\/\d{1,2}\/\d{2,4})/,  // MM/DD/YYYY or M/D/YY
        /(\d{1,2}-\d{1,2}-\d{2,4})/,  // MM-DD-YYYY
    ];

    // Parse EACH line separately to extract individual people
    for (const line of lines) {
        // Skip lines that are too short or look like headers
        if (line.length < 5 || /^(name|date|dob|birthday)/i.test(line)) continue;

        let name = null;
        let date = null;

        // Look for date in line
        for (const pattern of datePatterns) {
            const match = line.match(pattern);
            if (match) {
                date = match[1];
                // Extract name as everything before the date
                const parts = line.split(match[0]);
                name = parts[0].trim();
                // Remove common separators and labels
                name = name.replace(/^(name|dob|birthday|date of birth)[\s:|-]*(.*)$/i, '$2').trim();
                if (name && date) {
                    // PUSH AS INDIVIDUAL OBJECT - ONE PER PERSON
                    items.push({ name, date_of_birth: date });
                    break;
                }
            }
        }
    }

    return items;
}

// Parse PDF file and extract text with name/date patterns
// Returns array of {name, date_of_birth} objects
async function parsePDF(file) {
    try {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library not loaded');
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        // Extract text from all pages
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        // Parse text to find individual name/date patterns
        // First try student pattern
        let items = parseStudentBirthdayFile(fullText);

        if (items.length === 0) {
            // fallback
            items = extractBirthdaysFromText(fullText);
        }

        return items;

    } catch (err) {
        console.error('PDF parsing error:', err);
        throw new Error('Failed to parse PDF: ' + err.message);
    }
}

// Parse student birthday file format: REGISTER_NUMBER NAME DATE
// Example line: SCT23AM001 AADIL SANDEEP 21-09-2005
// Returns array of {name, date_of_birth} objects - ONE PER STUDENT
function parseStudentBirthdayFile(text) {
    const items = [];

    // Match pattern:
    // SCT23AM001 AADIL SANDEEP 21-09-2005
    const pattern = /SCT\d+[A-Z0-9]*\s+([A-Za-z\s\.]+?)\s+(\d{2})-(\d{2})-(\d{4})/g;

    let match;

    while ((match = pattern.exec(text)) !== null) {
        const name = match[1].trim();
        const day = match[2];
        const month = match[3];
        const year = match[4];

        const dateOfBirth = `${year}-${month}-${day}`;

        items.push({
            name,
            date_of_birth: dateOfBirth
        });
    }

    return items;
}


// helper: normalize various date strings to ISO YYYY-MM-DD, return null if invalid
function normalizeDateString(s) {
    if (!s || typeof s !== 'string') return null;
    let str = s.trim();
    if (str === '') return null;
    // iso format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return str;
        return null;
    }
    // dd-mm-yyyy or dd/mm/yyyy
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        const year = parseInt(m[3], 10);
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
        return null;
    }
    // fallback to Date parsing
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
    }
    return null;
}

// layer2: look for date matches and extract name from preceding text
function extractByDateLookback(text) {
    const results = [];
    const regex = /\b(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}-\d{2}-\d{2})\b/g;
    const ignoreKeywords = ['register', 'roll', 'report', 'address', 'generated'];
    let match;
    while ((match = regex.exec(text)) !== null) {
        const raw = match[1];
        const norm = normalizeDateString(raw);
        if (!norm) continue;
        const start = Math.max(0, match.index - 60);
        const prefix = text.slice(start, match.index);
        const nameMatch = prefix.match(/([A-Za-z]+(?:\s+[A-Za-z]+){1,3})\s*$/);
        if (nameMatch) {
            let name = nameMatch[1].trim();
            const low = name.toLowerCase();
            if (ignoreKeywords.some(k => low.includes(k))) continue;
            results.push({ name, date_of_birth: norm });
        }
    }
    return results;
}

// hybrid parser implementation
function parseTextHybrid(text) {
    if (!text || typeof text !== 'string') return [];
    // layer1: student structured
    let items = parseStudentBirthdayFile(text);
    if (items.length > 0) {
        // ensure dates normalized by student parser
    } else {
        // layer2
        items = extractByDateLookback(text);
        if (items.length === 0) {
            // layer3 fallback generic
            items = extractBirthdaysFromText(text);
        }
    }

    const seen = new Set();
    const normalized = [];
    for (const it of items) {
        if (!it.name) continue;
        const normDate = normalizeDateString(it.date_of_birth || it.date);
        if (!normDate) continue;
        const nm = it.name.trim();
        if (nm === '') continue;
        const key = `${nm}|${normDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push({ name: nm, date_of_birth: normDate });
    }
    return normalized;
}

// Parse file and return array of normalized birthdays: [{name, date_of_birth}, ...]
async function parseFileToItems(file) {
    if (!file) return [];
    const fileName = file.name.toLowerCase();
    let text = '';
    if (fileName.endsWith('.pdf')) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js not available');
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let full = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const txt = await page.getTextContent();
            full += txt.items.map(it => it.str).join(' ') + '\n';
        }
        text = full;
    } else if (fileName.endsWith('.txt')) {
        text = await file.text();
    } else {
        throw new Error('Unsupported file type. Only PDF and TXT are allowed.');
    }

    return parseTextHybrid(text);
}

// Bulk insert birthdays using Supabase - each item becomes ONE database row
async function bulkInsertBirthdays(items) {
    if (!items || items.length === 0) {
        showToast('No valid birthdays found to import', 'error');
        return 0;
    }

    try {
        // Prepare data for bulk insert - each person is a separate row
        const insertData = items.map(person => ({
            user_id: currentUser.id,
            name: person.name,
            date_of_birth: person.date_of_birth
        }));

        // Bulk insert all at once - NO LOOPS, NO COMBINING
        const { error } = await supabaseClient
            .from('birthdays')
            .insert(insertData);

        if (error) {
            throw error;
        }

        showToast(`✅ Imported ${items.length} birthday${items.length !== 1 ? 's' : ''}`, 'success');

        // Refresh the list
        const data = await fetchUserBirthdays(currentUser.id);
        birthdayManager = data.map(b => new Birthday(
            b.id,
            b.name,
            b.date_of_birth,
            {
                nickname: b.nickname,
                imageUrl: b.image_url,
                notes: b.notes,
                reminderPreferences: b.reminder_preferences
            }
        ));
        updateAllViews();
        
        return items.length;
    } catch (err) {
        console.error('Import error:', err);
        showToast('Import failed: ' + (err.message || 'Database error'), 'error');
        return 0;
    }
}

// Parse CSV content into array of objects with name and date_of_birth
function parseCSV(content) {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const items = [];

    // Parse EACH ROW separately - one object per row
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index];
        });
        // Each row is a separate object - don't combine
        items.push(obj);
    }

    return items;
}

document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        try {
            const items = await parseFileToItems(file);
            if (items.length > 0) {
                // filter duplicates against current list
                const existing = new Set(birthdayManager.map(b => `${b.name}|${b.dateOfBirth}`));
                let added = 0;
                for (const it of items) {
                    const key = `${it.name}|${it.date_of_birth}`;
                    if (existing.has(key)) continue;
                    const res = await insertBirthday(it.name, it.date_of_birth, currentUser.id);
                    if (res) {
                        birthdayManager.push(
                            new Birthday(res.id, res.name, res.date_of_birth, {
                                nickname: res.nickname,
                                imageUrl: res.image_url,
                                notes: res.notes,
                                reminderPreferences: res.reminder_preferences
                            })
                        );
                        existing.add(key);
                        added++;
                    }
                }
                if (added > 0) {
                    showToast(`Imported ${added} birthday${added === 1 ? '' : 's'}`, 'success');
                    updateAllViews();
                } else {
                    showToast('No new birthdays to import', 'error');
                }
            }
        } catch (err) {
            console.error('Import error:', err);
            showToast('Import failed: ' + (err.message || 'Invalid file format'), 'error');
        }
    }
    e.target.value = ''; // Reset file input
});

/* ============================================
   REMINDERS CHECK
============================================ */

async function checkRemindersOnLoad() {
    if (!birthdayManager || birthdayManager.length === 0) return;

    // ensure permission request already made
    requestNotificationPermission();

    const todayList = birthdayManager.filter(b => b.isToday());
    const reminderList = birthdayManager.filter(b => b.isReminderDueToday());
    const allDue = new Set([...todayList, ...reminderList]);
    if (allDue.size === 0) return;

    allDue.forEach(b => {
        const isToday = b.isToday();
        const prefs = b.reminderPreferences.join(', ');
        const msg = isToday
            ? `${b.name}'s birthday is today 🎉`
            : `${b.name}'s birthday is on ${b.getNextOccurrence().toLocaleDateString()}${prefs ? ` (reminders: ${prefs}d)` : ''}`;

        showToast('Reminder: ' + msg, 'success');
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            sendBirthdayNotification(b.name, msg);
        }
        if (isToday) spawnConfetti();
    });
}

/* ============================================
   PWA SERVICE WORKER REGISTRATION
============================================ */

// Service worker registration guarded by existence check
if ('serviceWorker' in navigator) {
    // perform HEAD check before attempting to register
    fetch('service-worker.js', { method: 'HEAD' })
        .then(resp => {
            if (resp.ok) {
                navigator.serviceWorker.register('service-worker.js')
                    .then(() => console.log('✅ Service Worker registered'))
                    .catch(err => console.warn('Service Worker registration failed:', err));
            } else {
                console.log('No service-worker.js file found, skipping registration.');
            }
        })
        .catch(err => {
            // network error or file missing, just skip
            console.log('Service worker check failed:', err);
        });
}



