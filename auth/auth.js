/* =========================================================
   SUPABASE CONFIGURATION
========================================================= */

const SUPABASE_URL =
    "https://skoiyiaijqhwqnbziqng.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_wk9YJslv6Ycf4Lffavnmkw_bZFkBK8E";

// Check if the global supabase object exists (loaded from CDN)
if (typeof supabase === 'undefined') {
    console.error("Supabase library not loaded. Please include the Supabase CDN script before this file.");
    alert("Critical error: Supabase client library is missing. Please refresh the page or contact support.");
    throw new Error("Supabase library not loaded.");
}

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


/* =========================================================
   FORMS
========================================================= */

const registerForm = document.getElementById("registerForm");
const loginForm = document.getElementById("loginForm");

const showLogin = document.getElementById("showLogin");
const showRegister = document.getElementById("showRegister");


/* =========================================================
   SHOW LOGIN
========================================================= */

if (showLogin) {
    showLogin.addEventListener("click", function (event) {
        event.preventDefault();

        if (registerForm) registerForm.classList.add("hidden");
        if (loginForm) loginForm.classList.remove("hidden");
    });
}


/* =========================================================
   SHOW REGISTER
========================================================= */

if (showRegister) {
    showRegister.addEventListener("click", function (event) {
        event.preventDefault();

        if (loginForm) loginForm.classList.add("hidden");
        if (registerForm) registerForm.classList.remove("hidden");
    });
}


/* =========================================================
   REGISTER
========================================================= */

if (registerForm) {

    registerForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const usernameInput   = document.getElementById("register-username");
        const departmentInput = document.getElementById("register-department");
        const birthdayInput   = document.getElementById("register-bday");
        const salvationInput  = document.getElementById("register-save");
        const baptismInput    = document.getElementById("register-baptism");
        const passwordInput   = document.getElementById("register-password");

        // Safety check
        if (!usernameInput || !departmentInput || !birthdayInput ||
            !salvationInput || !baptismInput || !passwordInput) {
            alert("Form fields are missing. Please reload the page.");
            return;
        }

        const username        = usernameInput.value.trim();
        const department      = departmentInput.value.trim();
        const birthday        = birthdayInput.value;         // "YYYY-MM-DD"
        const dateOfSalvation = salvationInput.value;        // "YYYY-MM-DD"
        const dateOfBaptism   = baptismInput.value;          // "YYYY-MM-DD"
        const password        = passwordInput.value;


        /* =====================================================
           VALIDATION
        ===================================================== */

        if (!username || !department || !birthday ||
            !dateOfSalvation || !dateOfBaptism || !password) {
            alert("Please complete all fields.");
            return;
        }

        if (username.length < 3) {
            alert("Username must be at least 3 characters.");
            return;
        }

        if (password.length < 8) {
            alert("Password must be at least 8 characters.");
            return;
        }


        /* =====================================================
           USERNAME FORMAT
        ===================================================== */

        const usernamePattern = /^[a-zA-Z0-9._-]+$/;

        if (!usernamePattern.test(username)) {
            alert(
                "Username can only contain letters, numbers, dots, underscores, and hyphens."
            );
            return;
        }


        /* =====================================================
           CHECK IF USERNAME ALREADY EXISTS
        ===================================================== */

        const {
            data: existingProfile,
            error: existingProfileError
        } = await supabaseClient
            .from("profiles")
            .select("id")
            .ilike("username", username)
            .maybeSingle();

        if (existingProfileError) {
            console.error("Username check error:", existingProfileError);
            alert("Unable to check username availability.");
            return;
        }

        if (existingProfile) {
            alert("Username already exists. Please choose another username.");
            return;
        }


        /* =====================================================
           CREATE INTERNAL EMAIL
        ===================================================== */

        const cleanUsername = username
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, "");

        const uniqueId = crypto
            .randomUUID()
            .replace(/-/g, "")
            .substring(0, 12);

        const internalEmail =
            `${cleanUsername}_${uniqueId}@gmail.com`;


        console.log("Creating account:", username);
        console.log("Department:", department);


        /* =====================================================
           CREATE SUPABASE AUTH ACCOUNT
        ===================================================== */

        try {

            const { data, error } = await supabaseClient.auth.signUp({

                email: internalEmail,

                password: password,

                options: {
                    data: {
                        username: username,
                        department: department,
                        birthday: birthday,
                        date_of_salvation: dateOfSalvation,
                        date_of_baptism: dateOfBaptism
                    }
                }

            });


            /* =================================================
               AUTH ERROR
            ================================================= */

            if (error) {
                console.error("Registration error:", error);
                console.error("Error code:", error.code);
                console.error("Error status:", error.status);
                alert("Registration failed:\n\n" + error.message);
                return;
            }


            /* =================================================
               USER NOT CREATED
            ================================================= */

            if (!data || !data.user) {
                alert("Account could not be created.");
                return;
            }


            /* =================================================
               SAVE PROFILE ROW
               (including the three date fields)
            ================================================= */

            const { error: profileError } = await supabaseClient
                .from("profiles")
                .upsert({
                    id: data.user.id,
                    username: username,
                    department: department,
                    birthday: birthday,
                    date_of_salvation: dateOfSalvation,
                    date_of_baptism: dateOfBaptism
                });

            if (profileError) {
                console.error("Profile save error:", profileError);
                alert(
                    "Account created, but your profile could not be saved:\n\n" +
                    profileError.message
                );
                return;
            }


            /* =================================================
               SUCCESS
            ================================================= */

            console.log("Supabase Auth User:", data.user.id);
            console.log("Internal email:", internalEmail);

            alert("Account created successfully!");


            /* =================================================
               RESET FORM
            ================================================= */

            registerForm.reset();


            /* =================================================
               SHOW LOGIN
            ================================================= */

            registerForm.classList.add("hidden");
            if (loginForm) loginForm.classList.remove("hidden");


            /* =================================================
               PUT USERNAME INTO LOGIN
            ================================================= */

            const loginUsername = document.getElementById("login-username");

            if (loginUsername) {
                loginUsername.value = username;
            }

        } catch (error) {

            console.error("Unexpected registration error:", error);
            alert("Something went wrong during registration.");
        }

    });

}


/* =========================================================
   LOGIN
========================================================= */

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();


        /* =====================================================
           GET VALUES
        ===================================================== */

        const usernameInput = document.getElementById("login-username");
        const passwordInput = document.getElementById("login-password");

        if (!usernameInput || !passwordInput) {
            alert("Login form fields are missing. Please reload the page.");
            return;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value;


        /* =====================================================
           VALIDATION
        ===================================================== */

        if (!username || !password) {
            alert("Please enter your username and password.");
            return;
        }


        try {

            /* =================================================
               STEP 1
               FIND INTERNAL EMAIL USING USERNAME
            ================================================= */

            console.log("Searching for username:", username);

            const {
                data: usernameEmail,
                error: usernameError
            } = await supabaseClient.rpc(
                "get_email_by_username",
                { requested_username: username }
            );


            /* =================================================
               RPC ERROR
            ================================================= */

            if (usernameError) {
                console.error("RPC ERROR:", usernameError);
                alert("Username lookup failed:\n\n" + usernameError.message);
                return;
            }


            /* =================================================
               USERNAME NOT FOUND
            ================================================= */

            if (!usernameEmail || usernameEmail.trim() === "") {
                console.error("RPC returned NULL or empty for:", username);
                alert("Username was not found.");
                return;
            }

            console.log("Internal Auth email found.");


            /* =================================================
               STEP 2
               SIGN IN USING INTERNAL EMAIL
            ================================================= */

            const {
                data: loginData,
                error: loginError
            } = await supabaseClient.auth.signInWithPassword({
                email: usernameEmail,
                password: password
            });


            /* =================================================
               PASSWORD / AUTH ERROR
            ================================================= */

            if (loginError) {
                console.error("AUTH LOGIN ERROR:", loginError);
                console.error("AUTH ERROR CODE:", loginError.code);
                console.error("AUTH ERROR STATUS:", loginError.status);
                alert("Invalid username or password.");
                return;
            }


            /* =================================================
               AUTH USER CHECK
            ================================================= */

            if (!loginData || !loginData.user) {
                alert("Login failed.");
                return;
            }

            const userId = loginData.user.id;

            console.log("Authenticated user:", userId);


            /* =================================================
               STEP 3
               GET PROFILE
            ================================================= */

            const {
                data: profile,
                error: profileError
            } = await supabaseClient
                .from("profiles")
                .select("id, username, department, birthday, date_of_salvation, date_of_baptism, role")
                .eq("id", userId)
                .maybeSingle();


            /* =================================================
               PROFILE ERROR
            ================================================= */

            if (profileError) {
                console.error("PROFILE ERROR:", profileError);
                await supabaseClient.auth.signOut();
                alert("Unable to load your profile.");
                return;
            }


            /* =================================================
               PROFILE DOES NOT EXIST
            ================================================= */

            if (!profile) {
                console.error("No profile found for Auth ID:", userId);
                await supabaseClient.auth.signOut();
                alert("Your account exists, but your profile was not found.");
                return;
            }

            console.log("PROFILE:", profile);


            /* =================================================
               ROLE + DEPARTMENT NORMALIZATION
            ================================================= */

            const role       = String(profile.role || "").trim().toLowerCase();
            const department = String(profile.department || "").trim().toLowerCase();

            console.log("Normalized role:", role);
            console.log("Normalized department:", department);


            /* =================================================
               ADMIN REDIRECTION
            ================================================= */

            /* ADULT MEN ADMIN */
            if (role === "admin" && department === "adult men") {
                window.location.href = "../admin/adultMen/AM.html";
                return;
            }

            /* ADULT LADIES ADMIN */
            if (role === "admin" && department === "adult ladies") {
                window.location.href = "../admin/adultLadies/AL.html";
                return;
            }

            /* YOUNG MEN ADMIN */
            if (role === "admin" && department === "young men") {
                window.location.href = "../admin/youngMen/YM.html";
                return;
            }

            /* YOUNG LADIES ADMIN */
            if (role === "admin" && department === "young ladies") {
                window.location.href = "../admin/youngLadies/YL.html";
                return;
            }

            /* BFAD ADMIN */
            if (role === "admin" && department === "bfad") {
                window.location.href = "../admin/BFAD/home.html";
                return;
            }


            /* =================================================
               NORMAL MEMBER
            ================================================= */

            window.location.href = "../home/main.html";

        } catch (error) {
            console.error("Unexpected login error:", error);
            alert("Login failed. Please try again.");
        }

    });

}