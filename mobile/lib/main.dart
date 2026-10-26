import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens.dart';
import 'onboarding.dart';
import 'auth_redirect.dart';

/// Public project URL supplied when building the application.
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');

/// Public client key; database policies enforce account access.
const supabaseKey = String.fromEnvironment('SUPABASE_ANON_KEY');

/// Initializes Supabase and launches the mobile app.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (supabaseUrl.isNotEmpty && supabaseKey.isNotEmpty) {
    await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseKey);
  }
  runApp(SproutSyncMobileApp(
      configured: supabaseUrl.isNotEmpty && supabaseKey.isNotEmpty));
}

/// Configures the shared mobile theme and authenticated entry.
class SproutSyncMobileApp extends StatelessWidget {
  /// Creates the SproutSyncMobileApp widget or field definition.
  const SproutSyncMobileApp({super.key, this.configured = false});

  /// Whether this build has the public Supabase configuration.
  final bool configured;
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'SproutSync',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF247547)),
          scaffoldBackgroundColor: const Color(0xFFF5F8F4),
          inputDecorationTheme: InputDecorationTheme(
              border:
                  OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
              filled: true,
              fillColor: Colors.white),
          appBarTheme: const AppBarTheme(
              backgroundColor: Color(0xFFF5F8F4), centerTitle: false),
        ),
        home: configured
            ? const SessionGate()
            : const Scaffold(
                body: SafeArea(
                    child: Center(
                        child: Padding(
                            padding: EdgeInsets.all(28),
                            child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(Icons.eco,
                                      size: 64, color: Color(0xFF247547)),
                                  SizedBox(height: 20),
                                  Text('Welcome to SproutSync',
                                      style: TextStyle(
                                          fontSize: 25,
                                          fontWeight: FontWeight.bold)),
                                  SizedBox(height: 12),
                                  Text(
                                      'Configure SUPABASE_URL and SUPABASE_ANON_KEY to connect this mobile build.',
                                      textAlign: TextAlign.center)
                                ]))))),
      );
}

/// Routes sessions through email verification, profile review and the workspace.
class SessionGate extends StatefulWidget {
  /// Creates the SessionGate widget or field definition.
  const SessionGate({super.key});
  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  final client = Supabase.instance.client;
  StreamSubscription<AuthState>? subscription;
  String? userId;
  Map<String, dynamic>? profile;
  String? error;
  bool recovery = false;
  @override
  void initState() {
    super.initState();
    userId = client.auth.currentUser?.id;
    if (userId != null) unawaited(loadProfile());
    subscription = client.auth.onAuthStateChange.listen((state) {
      if (!mounted) return;
      if (state.event == AuthChangeEvent.passwordRecovery) {
        setState(() => recovery = true);
      }
      final next = state.session?.user.id;
      if (next != userId) {
        setState(() {
          userId = next;
          profile = null;
          error = null;
        });
        if (next != null) unawaited(loadProfile());
      } else if (next != null && state.event == AuthChangeEvent.signedIn) {
        unawaited(loadProfile());
      }
    });
  }

  Future<void> loadProfile() async {
    final expected = userId;
    if (mounted) setState(() => error = null);
    try {
      final result =
          Map<String, dynamic>.from(await client.rpc('ensure_profile'));
      if (['operator', 'admin'].contains(result['role'])) {
        await client.rpc('initialize_workspace');
      }
      if (mounted && userId == expected) setState(() => profile = result);
    } catch (e) {
      if (mounted && userId == expected) {
        setState(() => error = readableError(e));
      }
    }
  }

  @override
  void dispose() {
    subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (recovery) {
      return MobileAuth(
          initialStep: 'password',
          onRecovered: () => setState(() => recovery = false));
    }
    if (userId == null) return const MobileAuth();
    if (error != null) {
      return Scaffold(
          body: SafeArea(
              child: Center(
                  child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(error!, textAlign: TextAlign.center),
                        FilledButton(
                            onPressed: loadProfile,
                            child: const Text('Try again')),
                        TextButton(
                            onPressed: () =>
                                client.auth.signOut(scope: SignOutScope.local),
                            child: const Text('Sign out'))
                      ])))));
    }
    if (profile == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (profile!['profile_complete'] != true &&
        profile!['registration_provider'] == 'google' &&
        profile!['onboarding_email_verified_at'] == null) {
      return GoogleEmailVerification(
          profile: profile!, onVerified: loadProfile);
    }
    if (profile!['profile_complete'] != true) {
      return ProfileForm(
          profile: profile!, onSaved: (next) => setState(() => profile = next));
    }
    return MobileWorkspace(
        profile: profile!, onProfile: (next) => setState(() => profile = next));
  }
}

/// Returns an actionable service error without exposing private diagnostics.
String readableError(Object error) => error is AuthException
    ? error.message
    : error is PostgrestException
        ? error.message
        : 'Could not connect. Please try again.';

/// Presents email, password, Google and recovery authentication screens.
class MobileAuth extends StatefulWidget {
  /// Creates the MobileAuth widget or field definition.
  const MobileAuth({super.key, this.initialStep = 'login', this.onRecovered});

  /// The first authentication step to show.
  final String initialStep;

  /// Returns to the workspace after changing the password.
  final VoidCallback? onRecovered;
  @override
  State<MobileAuth> createState() => _MobileAuthState();
}

class _MobileAuthState extends State<MobileAuth> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      confirmation = TextEditingController(),
      code = TextEditingController();
  late String step;
  bool busy = false, showPassword = false;
  String? error;
  int cooldown = 0;
  Timer? timer;
  final client = Supabase.instance.client;
  @override
  void initState() {
    super.initState();
    step = widget.initialStep;
  }

  @override
  void dispose() {
    timer?.cancel();
    email.dispose();
    password.dispose();
    confirmation.dispose();
    code.dispose();
    super.dispose();
  }

  void startCooldown() {
    timer?.cancel();
    setState(() => cooldown = 60);
    timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => cooldown--);
      if (cooldown <= 0) t.cancel();
    });
  }

  Future<void> submit() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final address = email.text.trim().toLowerCase();
      if (step == 'login') {
        await client.auth
            .signInWithPassword(email: address, password: password.text);
      } else if (step == 'register') {
        await client.auth.signUp(
            email: address,
            password: password.text,
            emailRedirectTo: authCallbackUrl());
        if (mounted) {
          setState(() => step = 'verify');
          password.clear();
          confirmation.clear();
          startCooldown();
        }
      } else if (step == 'verify' || step == 'recovery') {
        await client.auth.verifyOTP(
            email: address,
            token: code.text.trim(),
            type: step == 'verify' ? OtpType.signup : OtpType.recovery);
        if (mounted && step == 'recovery') setState(() => step = 'password');
      } else if (step == 'reset') {
        await client.auth
            .resetPasswordForEmail(address, redirectTo: authCallbackUrl());
        if (mounted) {
          setState(() => step = 'recovery');
          startCooldown();
        }
      } else if (step == 'password') {
        await client.auth.updateUser(UserAttributes(password: password.text));
        widget.onRecovered?.call();
      }
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resend() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (step == 'verify') {
        await client.auth.resend(
            type: OtpType.signup,
            email: email.text.trim(),
            emailRedirectTo: authCallbackUrl());
      } else {
        await client.auth.resetPasswordForEmail(email.text.trim(),
            redirectTo: authCallbackUrl());
      }
      if (mounted) startCooldown();
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> signInWithGoogle() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final opened = await client.auth.signInWithOAuth(OAuthProvider.google,
          redirectTo: authCallbackUrl(),
          authScreenLaunchMode: authBrowserLaunchMode());
      if (!opened && mounted) {
        setState(() => error =
            'Could not open Google sign-in. Install or enable a web browser and try again.');
      }
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final verify = step == 'verify' || step == 'recovery';
    final title = {
      'login': 'Welcome back',
      'register': 'Create account',
      'verify': 'Verify your email',
      'reset': 'Reset password',
      'recovery': 'Verify reset code',
      'password': 'New password'
    }[step]!;
    return Scaffold(
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 460),
                    child: SingleChildScrollView(
                        padding: const EdgeInsets.all(28),
                        child: Form(
                            key: form,
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  const Icon(Icons.eco_rounded,
                                      size: 64, color: Color(0xFF247547)),
                                  const SizedBox(height: 16),
                                  Text(title,
                                      style: const TextStyle(
                                          fontSize: 29,
                                          fontWeight: FontWeight.bold)),
                                  const SizedBox(height: 8),
                                  Text(
                                      verify
                                          ? 'Enter the code sent to ${email.text}.'
                                          : 'Your growing workspace, wherever you are.',
                                      style: const TextStyle(
                                          color: Colors.black54)),
                                  const SizedBox(height: 24),
                                  if (!verify && step != 'password')
                                    TextFormField(
                                        controller: email,
                                        enabled: !busy,
                                        keyboardType:
                                            TextInputType.emailAddress,
                                        autofillHints: const [
                                          AutofillHints.email
                                        ],
                                        decoration: const InputDecoration(
                                            labelText: 'Email address'),
                                        validator: (v) => v != null &&
                                                RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                                    .hasMatch(v.trim())
                                            ? null
                                            : 'Enter a valid email'),
                                  if (verify)
                                    TextFormField(
                                        controller: code,
                                        enabled: !busy,
                                        keyboardType: TextInputType.number,
                                        autofillHints: const [
                                          AutofillHints.oneTimeCode
                                        ],
                                        maxLength: 8,
                                        decoration: const InputDecoration(
                                            labelText: 'Verification code'),
                                        validator: (v) => RegExp(r'^\d{6,8}$')
                                                .hasMatch(v ?? '')
                                            ? null
                                            : 'Enter the code from your email'),
                                  if (['login', 'register', 'password']
                                      .contains(step)) ...[
                                    const SizedBox(height: 16),
                                    TextFormField(
                                        controller: password,
                                        enabled: !busy,
                                        obscureText: !showPassword,
                                        decoration: InputDecoration(
                                            labelText: 'Password',
                                            suffixIcon: IconButton(
                                                tooltip: showPassword
                                                    ? 'Hide password'
                                                    : 'Show password',
                                                onPressed: () => setState(() =>
                                                    showPassword =
                                                        !showPassword),
                                                icon: Icon(showPassword
                                                    ? Icons.visibility_off
                                                    : Icons.visibility))),
                                        validator: (v) => (v?.length ?? 0) >=
                                                (step == 'login' ? 1 : 8)
                                            ? null
                                            : 'Use at least 8 characters'),
                                    if (step != 'login') ...[
                                      const SizedBox(height: 16),
                                      TextFormField(
                                          controller: confirmation,
                                          enabled: !busy,
                                          obscureText: !showPassword,
                                          decoration: const InputDecoration(
                                              labelText: 'Confirm password'),
                                          validator: (v) => v == password.text
                                              ? null
                                              : 'Passwords do not match')
                                    ],
                                  ],
                                  if (step == 'login')
                                    Align(
                                        alignment: Alignment.centerRight,
                                        child: TextButton(
                                            onPressed: busy
                                                ? null
                                                : () => setState(() {
                                                      step = 'reset';
                                                      error = null;
                                                    }),
                                            child: const Text(
                                                'Forgot password?'))),
                                  if (error != null)
                                    Padding(
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 12),
                                        child: Text(error!,
                                            style: TextStyle(
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .error))),
                                  const SizedBox(height: 20),
                                  FilledButton(
                                      onPressed: busy ? null : submit,
                                      child: Padding(
                                          padding: const EdgeInsets.all(12),
                                          child: Text(busy
                                              ? 'Please wait…'
                                              : verify
                                                  ? 'Verify email'
                                                  : step == 'password'
                                                      ? 'Save password'
                                                      : title))),
                                  if (verify)
                                    TextButton(
                                        onPressed: busy || cooldown > 0
                                            ? null
                                            : resend,
                                        child: Text(cooldown > 0
                                            ? 'Resend in ${cooldown}s'
                                            : 'Resend code')),
                                  if (step == 'login' ||
                                      step == 'register') ...[
                                    const Padding(
                                        padding:
                                            EdgeInsets.symmetric(vertical: 18),
                                        child: Text('or continue with',
                                            textAlign: TextAlign.center)),
                                    OutlinedButton(
                                        onPressed:
                                            busy ? null : signInWithGoogle,
                                        child: const Padding(
                                            padding: EdgeInsets.all(12),
                                            child: Text('Google'))),
                                    TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => setState(() {
                                                  step = step == 'login'
                                                      ? 'register'
                                                      : 'login';
                                                  error = null;
                                                }),
                                        child: Text(step == 'login'
                                            ? 'Create an account'
                                            : 'Already have an account? Sign in'))
                                  ],
                                  if (!['login', 'register', 'password']
                                      .contains(step))
                                    TextButton(
                                        onPressed: busy
                                            ? null
                                            : () => setState(() {
                                                  step = 'login';
                                                  error = null;
                                                }),
                                        child: const Text('Back to sign in')),
                                ])))))));
  }
}

/// Collects or confirms the account details persisted in Supabase.
class ProfileForm extends StatefulWidget {
  /// Creates the ProfileForm widget or field definition.
  const ProfileForm(
      {super.key,
      required this.profile,
      required this.onSaved,
      this.editing = false});

  /// The current database profile.
  final Map<String, dynamic> profile;

  /// Receives the successfully saved database profile.
  final ValueChanged<Map<String, dynamic>> onSaved;

  /// Whether an existing profile is being edited.
  final bool editing;
  @override
  State<ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends State<ProfileForm> {
  late bool editDetails = widget.editing ||
      widget.profile['registration_provider'] != 'google' ||
      (widget.profile['first_name'] as String? ?? '').isEmpty;
  final form = GlobalKey<FormState>();
  late final first = TextEditingController(text: widget.profile['first_name']);
  late final last = TextEditingController(text: widget.profile['last_name']);
  late final organization =
      TextEditingController(text: widget.profile['organization']);
  late final phone = TextEditingController(text: widget.profile['phone']);
  bool busy = false;
  String? error;
  @override
  void dispose() {
    first.dispose();
    last.dispose();
    organization.dispose();
    phone.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (!form.currentState!.validate()) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final result = Map<String, dynamic>.from(
          await Supabase.instance.client.rpc('save_profile', params: {
        'given_name': first.text.trim(),
        'family_name': last.text.trim(),
        'company': organization.text.trim(),
        'contact_phone': phone.text.trim()
      }));
      if (mounted) widget.onSaved(result);
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Personal details')),
      body: SafeArea(
          child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Form(
                  key: form,
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (!widget.editing)
                          const Text('Email verified. One last step.',
                              style: TextStyle(
                                  fontSize: 22, fontWeight: FontWeight.bold)),
                        Text(widget.profile['email'] ?? ''),
                        const SizedBox(height: 24),
                        if (!editDetails) ...[
                          for (final entry in [
                            (first, 'First name'),
                            (last, 'Last name'),
                            (organization, 'Organization'),
                            (phone, 'Phone')
                          ])
                            ListTile(
                                title: Text(entry.$2),
                                subtitle: Text(entry.$1.text.isEmpty
                                    ? 'Not provided'
                                    : entry.$1.text)),
                          TextButton.icon(
                              onPressed: () =>
                                  setState(() => editDetails = true),
                              icon: const Icon(Icons.edit_outlined),
                              label: const Text('Edit information')),
                        ],
                        if (editDetails)
                          for (final entry in [
                            (first, 'First name', 80, true),
                            (
                              last,
                              'Last name',
                              80,
                              widget.profile['registration_provider'] !=
                                  'google'
                            ),
                            (
                              organization,
                              'Organization (optional)',
                              160,
                              false
                            ),
                            (phone, 'Phone (optional)', 40, false)
                          ])
                            Padding(
                                padding: const EdgeInsets.only(bottom: 16),
                                child: TextFormField(
                                    controller: entry.$1,
                                    enabled: !busy,
                                    maxLength: entry.$3,
                                    decoration:
                                        InputDecoration(labelText: entry.$2),
                                    validator: (v) =>
                                        entry.$4 && (v?.trim().isEmpty ?? true)
                                            ? 'Required'
                                            : null)),
                        if (error != null)
                          Text(error!,
                              style: const TextStyle(color: Colors.red)),
                        FilledButton(
                            onPressed: busy ? null : save,
                            child: Text(busy
                                ? 'Saving…'
                                : widget.editing
                                    ? 'Save changes'
                                    : widget.profile['registration_provider'] ==
                                            'google'
                                        ? 'Confirm & continue'
                                        : 'Open dashboard')),
                      ])))));
}
