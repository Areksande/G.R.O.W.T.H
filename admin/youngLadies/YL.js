/* =========================================================
   SUPABASE CONFIG
========================================================= */

const SUPABASE_URL = "https://skoiyiaijqhwqnbziqng.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wk9YJslv6Ycf4Lffavnmkw_bZFkBK8E";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

const DEPARTMENT_NAME  = "Young Ladies";
const ABSENCES_TABLE   = "absences";
const ATTENDANCE_TABLE = "attendance";
const PROFILES_TABLE   = "profiles";


/* =========================================================
   SHARED STATE
========================================================= */

let currentReflections   = [];     // cache for the reply modal
let currentReflectionId  = null;   // ID of the reflection open in the reply modal

let currentAbsences      = [];     // cache for the absence modal
let currentAbsenceId     = null;   // ID of the absence open in the modal


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   TIME-BASED GREETING
========================================================= */

function getGreetingWord() {
    const hour = new Date().getHours();
    if (hour < 12) return "Mapagpalang Umaga";
    if (hour < 18) return "Mapagpalang Hapon";
    return "Mapagpalang Gabi";
}


/* =========================================================
   AUTH GUARD + GREETING
========================================================= */

async function loadAdminGreeting() {

    const nameSpan = document.getElementById("greeting-name");
    const timeSpan = document.getElementById("greeting-time");

    if (timeSpan) timeSpan.textContent = getGreetingWord();
    if (!nameSpan) return;

    try {

        const { data: { user }, error: userError } =
            await supabaseClient.auth.getUser();

        if (userError || !user) {
            window.location.href = "../../auth/auth.html";
            return;
        }

        const { data: profile, error: profileError } =
            await supabaseClient
                .from(PROFILES_TABLE)
                .select("username, role, department")
                .eq("id", user.id)
                .maybeSingle();

        if (profileError || !profile) {
            nameSpan.textContent = "Admin";
            return;
        }

        const role = String(profile.role || "").toLowerCase();
        const dept = String(profile.department || "").toLowerCase();

        if (role !== "admin" || dept !== DEPARTMENT_NAME.toLowerCase()) {
            console.warn("Not authorized for Young Ladies.");
            window.location.href = "../../home/main.html";
            return;
        }

        const displayName = (profile.username || "Admin").split(/[._-]/)[0];
        nameSpan.textContent = displayName;

    } catch (err) {
        console.error("Greeting error:", err);
        if (nameSpan) nameSpan.textContent = "Admin";
    }
}


/* =========================================================
   REFLECTIONS — LOAD & RENDER
========================================================= */

async function loadDepartmentReflections() {

    const container = document.getElementById("reflectionsContainer");
    if (!container) return;

    try {

        const { data: reflections, error: reflectionsError } =
            await supabaseClient
                .from("reflections")
                .select("id, content, created_at, user_id, department, admin_reply, replied_at")
                .eq("department", DEPARTMENT_NAME)
                .order("created_at", { ascending: false });

        if (reflectionsError) {
            console.error("Reflections fetch error:", reflectionsError);
            container.innerHTML =
                `<p class="error-text">Failed to load reflections: ${reflectionsError.message}</p>`;
            return;
        }

        if (!reflections || reflections.length === 0) {
            container.innerHTML =
                `<p class="empty-text">No reflections submitted yet.</p>`;
            currentReflections = [];
            return;
        }

        /* Fetch usernames for all reflection authors */
        const userIds = [...new Set(reflections.map(r => r.user_id))];

        const { data: profiles, error: profilesError } = await supabaseClient
            .from(PROFILES_TABLE)
            .select("id, username")
            .in("id", userIds);

        if (profilesError) {
            console.warn("Could not load usernames:", profilesError);
        }

        const usernameMap = {};
        (profiles || []).forEach(p => {
            usernameMap[p.id] = p.username;
        });

        /* Cache for reply modal lookups */
        currentReflections = reflections;

        /* Render */
        container.innerHTML = reflections.map(r => {
            const rawName = usernameMap[r.user_id] || "Unknown Member";
            const safeName = escapeHtml(rawName);
            const dateStr = new Date(r.created_at).toLocaleString();

            const hasReply = r.admin_reply && r.admin_reply.trim().length > 0;

            const replyHTML = hasReply
                ? `
                    <div class="reflection-reply-display">
                        <div class="reflection-reply-header">
                            <span class="reflection-reply-label">Admin Reply</span>
                            <span class="reflection-reply-date">
                                ${r.replied_at ? new Date(r.replied_at).toLocaleString() : ""}
                            </span>
                        </div>
                        <p class="reflection-reply-text">${escapeHtml(r.admin_reply)}</p>
                    </div>
                `
                : "";

            return `
                <div class="reflection-card" data-id="${r.id}">
                    <div class="reflection-header">
                        <span class="reflection-sender">${safeName}</span>
                        <span class="reflection-date">${dateStr}</span>
                    </div>
                    <p class="reflection-content">${escapeHtml(r.content)}</p>

                    ${replyHTML}

                    <button
                        type="button"
                        class="reflection-reply-btn"
                        data-id="${r.id}"
                    >
                        ${hasReply ? "Edit Reply" : "Reply"}
                    </button>
                </div>
            `;
        }).join("");

        /* Attach reply button handlers */
        container.querySelectorAll(".reflection-reply-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                openReplyModal(btn.dataset.id);
            });
        });

    } catch (err) {
        console.error("Unexpected error:", err);
        container.innerHTML =
            `<p class="error-text">Something went wrong loading reflections.</p>`;
    }
}


/* =========================================================
   REPLY MODAL
========================================================= */

const replyModal        = document.getElementById("replyModal");
const replyModalClose   = document.getElementById("replyModalClose");
const replyModalDate    = document.getElementById("replyModalDate");
const replyOriginalText = document.getElementById("replyOriginalText");
const replyInput        = document.getElementById("replyInput");
const replyCancel       = document.getElementById("replyCancel");
const replySave         = document.getElementById("replySave");
const replyStatus       = document.getElementById("replyStatus");


function openReplyModal(reflectionId) {
    const reflection = currentReflections.find(
        r => String(r.id) === String(reflectionId)
    );
    if (!reflection) return;

    currentReflectionId = reflectionId;

    /* Header */
    replyModalDate.textContent =
        new Date(reflection.created_at).toLocaleString();

    /* Original text preview */
    replyOriginalText.textContent = reflection.content;

    /* Prefill reply if editing */
    replyInput.value = reflection.admin_reply || "";

    replyStatus.textContent = "";
    replyStatus.classList.remove("success", "error");

    replyModal.style.display = "flex";
    document.body.style.overflow = "hidden";

    setTimeout(() => {
        replyInput.focus();
        replyInput.select();
    }, 80);
}


function closeReplyModal() {
    replyModal.style.display = "none";
    document.body.style.overflow = "";
    currentReflectionId = null;
    replyStatus.textContent = "";
    replyStatus.classList.remove("success", "error");
}


async function saveReply() {
    if (!currentReflectionId) return;

    const replyText = replyInput.value.trim();

    if (!replyText) {
        replyStatus.textContent = "Please write a reply before saving.";
        replyStatus.classList.remove("success");
        replyStatus.classList.add("error");
        replyInput.focus();
        return;
    }

    replySave.disabled = true;
    replyCancel.disabled = true;
    replyStatus.textContent = "Saving…";
    replyStatus.classList.remove("success", "error");

    try {
        const { data, error } = await supabaseClient
            .from("reflections")
            .update({
                admin_reply: replyText,
                replied_at:  new Date().toISOString()
            })
            .eq("id", currentReflectionId)
            .select("admin_reply, replied_at")
            .single();

        if (error) throw error;

        if (!data) {
            throw new Error(
                "Reply could not be saved. Check the `reflections` table has an UPDATE policy."
            );
        }

        replyStatus.textContent = "✓ Reply sent.";
        replyStatus.classList.remove("error");
        replyStatus.classList.add("success");

        /* Update cache */
        const r = currentReflections.find(
            x => String(x.id) === String(currentReflectionId)
        );
        if (r) {
            r.admin_reply = data.admin_reply;
            r.replied_at  = data.replied_at;
        }

        setTimeout(async () => {
            closeReplyModal();
            await loadDepartmentReflections();
        }, 700);

    } catch (err) {
        console.error("Save reply error:", err);
        replyStatus.textContent =
            err.message || "Could not save reply. Please try again.";
        replyStatus.classList.remove("success");
        replyStatus.classList.add("error");
    } finally {
        replySave.disabled = false;
        replyCancel.disabled = false;
    }
}


/* Reply modal event wiring */
if (replyModalClose) replyModalClose.addEventListener("click", closeReplyModal);
if (replyCancel)     replyCancel.addEventListener("click", closeReplyModal);
if (replySave)       replySave.addEventListener("click", saveReply);

if (replyModal) {
    replyModal.addEventListener("click", (e) => {
        if (e.target === replyModal) closeReplyModal();
    });
}

if (replyInput) {
    replyInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeReplyModal();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            saveReply();
        }
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && replyModal?.style.display === "flex") {
        closeReplyModal();
    }
});


/* =========================================================
   ABSENCES — LOAD & RENDER
========================================================= */

async function loadAbsences() {
    const listEl    = document.getElementById("absencesList");
    const emptyEl   = document.getElementById("absencesEmpty");
    const loadingEl = document.getElementById("absencesLoading");
    const countEl   = document.getElementById("absencesCount");

    if (!listEl) return;

    loadingEl.style.display = "flex";
    emptyEl.style.display = "none";
    listEl.innerHTML = "";

    let rows = [];

    /* 1. Try the `absences` table (preferred) */
    try {
        const { data, error } = await supabaseClient
            .from(ABSENCES_TABLE)
            .select("id, username, department, absence_date, reason, admin_note, created_at")
            .eq("department", DEPARTMENT_NAME)
            .order("absence_date", { ascending: false })
            .limit(100);

        if (error) {
            console.warn("absences table fetch failed, will fallback:", error.message);
        } else {
            rows = data || [];
            console.log("✅ Loaded from `absences`:", rows.length, "rows");
        }

    } catch (err) {
        console.warn("absences fetch threw:", err);
    }

    /* 2. Fallback → attendance table */
    if (!rows.length) {
        try {
            console.log("↪ Falling back to `attendance` table…");

            const { data: members, error: membersErr } = await supabaseClient
                .from(PROFILES_TABLE)
                .select("id, username")
                .eq("department", DEPARTMENT_NAME);

            if (membersErr) throw membersErr;

            if (members && members.length) {
                const memberIds = members.map(m => m.id);
                const usernameById = {};
                members.forEach(m => { usernameById[m.id] = m.username; });

                const { data: absentRows, error: absentErr } = await supabaseClient
                    .from(ATTENDANCE_TABLE)
                    .select("user_id, attendance_date, status, reason, created_at")
                    .in("user_id", memberIds)
                    .eq("status", "absent")
                    .not("reason", "is", null)
                    .order("attendance_date", { ascending: false })
                    .limit(100);

                if (absentErr) throw absentErr;

                rows = (absentRows || []).map(r => ({
                    id:           r.user_id + "_" + r.attendance_date,
                    username:     usernameById[r.user_id] || "Unknown",
                    department:   DEPARTMENT_NAME,
                    absence_date: r.attendance_date,
                    reason:       r.reason,
                    admin_note:   null,
                    created_at:   r.created_at
                }));

                console.log("✅ Loaded from `attendance` fallback:", rows.length, "rows");
            }

        } catch (err) {
            console.error("Fallback fetch error:", err);
        }
    }

    /* 3. Cache + render */
    currentAbsences = rows;

    try {
        countEl.textContent = rows.length;
        countEl.classList.toggle("has-items", rows.length > 0);

        if (!rows.length) {
            listEl.style.display = "none";
            emptyEl.style.display = "block";
            return;
        }

        listEl.style.display = "flex";
        emptyEl.style.display = "none";

        rows.forEach((row) => {
            const li = document.createElement("li");
            li.className = "absence-item";
            li.dataset.id = row.id;
            li.setAttribute("role", "button");
            li.setAttribute("tabindex", "0");

            const hasNote = row.admin_note && row.admin_note.trim().length > 0;
            const noteBadge = hasNote
                ? `<span class="absence-note-badge" title="Noted">✓</span>`
                : "";

            const initial = (row.username || "?").charAt(0).toUpperCase();

            li.innerHTML = `
                <div class="absence-avatar">${escapeHtml(initial)}</div>
                <div class="absence-info">
                    <div class="absence-top">
                        <span class="absence-name">${escapeHtml(row.username)}</span>
                        <span class="absence-date">${formatAbsenceDate(row.absence_date)}</span>
                    </div>
                    <span class="absence-reason">${escapeHtml(row.reason)}</span>
                </div>
                ${noteBadge}
            `;

            li.addEventListener("click", () => openAbsenceModal(row.id));
            li.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openAbsenceModal(row.id);
                }
            });

            listEl.appendChild(li);
        });

    } finally {
        loadingEl.style.display = "none";
    }
}


function formatAbsenceDate(dateStr) {
    if (!dateStr) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-PH", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}


/* =========================================================
   ABSENCES — REALTIME
========================================================= */

function subscribeAbsences() {

    supabaseClient
        .channel("absences-" + DEPARTMENT_NAME)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: ABSENCES_TABLE },
            (payload) => {
                const row = payload.new || payload.old;
                if (row?.department === DEPARTMENT_NAME) {
                    console.log("Realtime: absences changed → reload");
                    loadAbsences();
                }
            }
        )
        .subscribe();

    supabaseClient
        .channel("attendance-" + DEPARTMENT_NAME)
        .on(
            "postgres_changes",
            { event: "*", schema: "public", table: ATTENDANCE_TABLE },
            (payload) => {
                const row = payload.new || payload.old;
                if (row?.status === "absent" && row?.reason) {
                    console.log("Realtime: attendance (absent) changed → reload");
                    loadAbsences();
                }
            }
        )
        .subscribe();
}


/* =========================================================
   ABSENCE DETAIL MODAL — Noted toggle
========================================================= */

const absenceModal        = document.getElementById("absenceModal");
const absenceModalClose   = document.getElementById("absenceModalClose");
const absenceModalTitle   = document.getElementById("absenceModalTitle");
const absenceModalDate    = document.getElementById("absenceModalDate");
const absenceModalAvatar  = document.getElementById("absenceModalAvatar");
const absenceModalName    = document.getElementById("absenceModalName");
const absenceModalDept    = document.getElementById("absenceModalDept");
const absenceModalReason  = document.getElementById("absenceModalReason");

const absenceNotedBtn     = document.getElementById("absenceNotedBtn");
const absenceNotedIcon    = document.getElementById("absenceNotedIcon");
const absenceNotedLabel   = document.getElementById("absenceNotedLabel");
const absenceNotedHint    = document.getElementById("absenceNotedHint");
const absenceNoteCancel   = document.getElementById("absenceNoteCancel");


function openAbsenceModal(id) {
    const row = currentAbsences.find(r => String(r.id) === String(id));
    if (!row) return;

    currentAbsenceId = id;

    absenceModalTitle.textContent  = row.username || "Absence Detail";
    absenceModalDate.textContent   = formatAbsenceDate(row.absence_date);

    absenceModalAvatar.textContent = (row.username || "?").charAt(0).toUpperCase();
    absenceModalName.textContent   = row.username || "—";
    absenceModalDept.textContent   = row.department || DEPARTMENT_NAME;
    absenceModalReason.textContent = row.reason || "—";

    /* Set the Noted button state from the row */
    const isNoted = !!(row.admin_note && row.admin_note.trim().length > 0);
    applyNotedState(isNoted, false);

    if (absenceNotedHint) absenceNotedHint.style.color = "";

    absenceModal.style.display = "flex";
    document.body.style.overflow = "hidden";
}


function closeAbsenceModal() {
    absenceModal.style.display = "none";
    document.body.style.overflow = "";
    currentAbsenceId = null;
}


function applyNotedState(isNoted, animate = true) {
    if (!absenceNotedBtn) return;

    absenceNotedBtn.classList.toggle("is-noted", isNoted);
    absenceNotedBtn.setAttribute("aria-pressed", isNoted ? "true" : "false");

    if (absenceNotedIcon)  absenceNotedIcon.textContent  = isNoted ? "✓" : "○";
    if (absenceNotedLabel) absenceNotedLabel.textContent = "Noted";

    if (absenceNotedHint) {
        absenceNotedHint.textContent = isNoted
            ? "This absence has been acknowledged."
            : "Mark this absence as acknowledged.";
        absenceNotedHint.style.color = "";
    }

    /* Re-trigger the pulse animation when turning on */
    if (isNoted && animate) {
        absenceNotedBtn.classList.remove("is-noted");
        void absenceNotedBtn.offsetWidth;
        absenceNotedBtn.classList.add("is-noted");
    }
}


if (absenceNotedBtn) {
    absenceNotedBtn.addEventListener("click", async () => {
        if (!currentAbsenceId) return;

        const row = currentAbsences.find(
            r => String(r.id) === String(currentAbsenceId)
        );
        if (!row) return;

        /* Only real `absences` rows can be toggled */
        const isRealAbsenceRow =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id);

        if (!isRealAbsenceRow) {
            if (absenceNotedHint) {
                absenceNotedHint.textContent =
                    "This entry comes from the attendance fallback and can't be marked as noted.";
                absenceNotedHint.style.color = "#b91c1c";
            }
            return;
        }

        const currentlyNoted = !!(row.admin_note && row.admin_note.trim().length > 0);
        const nextNoted      = !currentlyNoted;

        absenceNotedBtn.disabled = true;

        try {
            const { data, error } = await supabaseClient
                .from(ABSENCES_TABLE)
                .update({ admin_note: nextNoted ? "Noted" : null })
                .eq("id", currentAbsenceId)
                .select("admin_note")
                .single();

            if (error) throw error;

            if (!data) {
                throw new Error(
                    "Could not update. Check the `absences` table has an UPDATE policy."
                );
            }

            row.admin_note = data.admin_note;

            applyNotedState(nextNoted);
            refreshAbsenceBadge(currentAbsenceId, nextNoted);

        } catch (err) {
            console.error("Noted toggle error:", err);
            if (absenceNotedHint) {
                absenceNotedHint.textContent =
                    err.message || "Could not save. Please try again.";
                absenceNotedHint.style.color = "#b91c1c";
            }
        } finally {
            absenceNotedBtn.disabled = false;
        }
    });
}


function refreshAbsenceBadge(id, hasNote) {
    const item = document.querySelector(`.absence-item[data-id="${id}"]`);
    if (!item) return;

    const existingBadge = item.querySelector(".absence-note-badge");

    if (hasNote && !existingBadge) {
        const badge = document.createElement("span");
        badge.className = "absence-note-badge";
        badge.title = "Noted";
        badge.textContent = "✓";
        item.appendChild(badge);
    } else if (!hasNote && existingBadge) {
        existingBadge.remove();
    }
}


/* Absence modal event wiring */
if (absenceModalClose) absenceModalClose.addEventListener("click", closeAbsenceModal);
if (absenceNoteCancel) absenceNoteCancel.addEventListener("click", closeAbsenceModal);

if (absenceModal) {
    absenceModal.addEventListener("click", (e) => {
        if (e.target === absenceModal) closeAbsenceModal();
    });
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && absenceModal?.style.display === "flex") {
        closeAbsenceModal();
    }
});


/* =========================================================
   PROGRESS — MONTH KEY
========================================================= */

function getCurrentMonthKey() {
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const now = new Date();
    return `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
}


/* =========================================================
   MEMBER PROGRESS
========================================================= */

async function loadMemberProgress() {

    const container = document.getElementById("progressContainer");
    if (!container) return;

    try {

        const { data: members, error: membersError } =
            await supabaseClient
                .from(PROFILES_TABLE)
                .select("id, username")
                .eq("department", DEPARTMENT_NAME)
                .order("username", { ascending: true });

        if (membersError) {
            console.error("Members fetch error:", membersError);
            container.innerHTML =
                `<p class="error-text">Failed to load members: ${membersError.message}</p>`;
            return;
        }

        if (!members || members.length === 0) {
            container.innerHTML =
                `<p class="empty-text">No members in this department yet.</p>`;
            return;
        }

        const memberIds = members.map(m => m.id);
        const monthKey = getCurrentMonthKey();

        const { data: checks, error: checksError } =
            await supabaseClient
                .from("checklist_checks")
                .select("user_id, row_letter, checked")
                .in("user_id", memberIds)
                .eq("month", monthKey)
                .eq("checked", true);

        if (checksError) {
            console.error("Checks fetch error:", checksError);
            container.innerHTML =
                `<p class="error-text">Failed to load progress: ${checksError.message}</p>`;
            return;
        }

        const tally = {};

        members.forEach(m => {
            tally[m.id] = { G: 0, R: 0, O: 0, W: 0, T: 0, H: 0 };
        });

        (checks || []).forEach(c => {
            if (!tally[c.user_id]) return;
            if (tally[c.user_id][c.row_letter] !== undefined) {
                tally[c.user_id][c.row_letter]++;
            }
        });

        container.innerHTML = `
            <div class="progress-table-wrapper">
                <table class="progress-table">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>G</th>
                            <th>R</th>
                            <th>O</th>
                            <th>W</th>
                            <th>T</th>
                            <th>H</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${members.map(m => {
            const t = tally[m.id];
            const total = t.G + t.R + t.O + t.W + t.T + t.H;
            return `
                                <tr>
                                    <td class="progress-member">${escapeHtml(m.username)}</td>
                                    <td class="progress-count ${t.G > 0 ? 'has-check' : ''}">${t.G}</td>
                                    <td class="progress-count ${t.R > 0 ? 'has-check' : ''}">${t.R}</td>
                                    <td class="progress-count ${t.O > 0 ? 'has-check' : ''}">${t.O}</td>
                                    <td class="progress-count ${t.W > 0 ? 'has-check' : ''}">${t.W}</td>
                                    <td class="progress-count ${t.T > 0 ? 'has-check' : ''}">${t.T}</td>
                                    <td class="progress-count ${t.H > 0 ? 'has-check' : ''}">${t.H}</td>
                                    <td class="progress-total">${total}</td>
                                </tr>
                            `;
        }).join("")}
                    </tbody>
                </table>
            </div>
            <p class="progress-note">
                Month: <strong>${monthKey}</strong> &middot;
                ${members.length} member${members.length === 1 ? "" : "s"}
            </p>
        `;

    } catch (err) {
        console.error("Unexpected progress error:", err);
        container.innerHTML =
            `<p class="error-text">Something went wrong loading progress.</p>`;
    }
}


/* =========================================================
   HAMBURGER MENU
========================================================= */

function setupHamburger() {

    const hamburger = document.getElementById("hamburgerBtn");
    const sidebar   = document.getElementById("sidebar");

    if (!hamburger || !sidebar) return;

    hamburger.addEventListener("click", function (event) {
        event.stopPropagation();
        sidebar.classList.toggle("open");
    });

    document.addEventListener("click", function (event) {
        if (window.innerWidth > 768) return;
        if (!sidebar.contains(event.target) &&
            !hamburger.contains(event.target)) {
            sidebar.classList.remove("open");
        }
    });

    sidebar.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove("open");
            }
        });
    });
}


/* =========================================================
   LOGOUT
========================================================= */

async function handleLogout(event) {
    event.preventDefault();

    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Logout error:", error);
        alert("Logout failed.");
        return;
    }

    window.location.href = "../../auth/auth.html";
}


/* =========================================================
   RUN ON PAGE LOAD
========================================================= */

document.addEventListener("DOMContentLoaded", function () {

    loadAdminGreeting();
    loadDepartmentReflections();
    loadMemberProgress();
    loadAbsences();
    subscribeAbsences();
    setupHamburger();

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
});