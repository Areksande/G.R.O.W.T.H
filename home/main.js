async function loadGreeting() {

    const nameSpan = document.getElementById("greeting-name");
    if (!nameSpan) return;

    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
        nameSpan.textContent = "Guest";
        return;
    }

    // Try metadata first
    const metaUsername = user.user_metadata?.username;

    if (metaUsername) {
        nameSpan.textContent = metaUsername;
        return;
    }

    // Fallback to profiles table
    const { data: profile } = await supabaseClient
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

    nameSpan.textContent = profile?.username || "User";
}

document.addEventListener("DOMContentLoaded", loadGreeting);