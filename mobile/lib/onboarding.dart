import 'dart:async';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'main.dart';
import 'auth_redirect.dart';

/// Verifies the inbox for a new Google account before profile confirmation.
class GoogleEmailVerification extends StatefulWidget {
  /// Creates an email verification screen for the Google identity.
  const GoogleEmailVerification(
      {super.key, required this.profile, required this.onVerified});

  /// The account whose verified Google email receives the message.
  final Map<String, dynamic> profile;

  /// Reloads the persisted profile after the verification token is exchanged.
  final Future<void> Function() onVerified;
  @override
  State<GoogleEmailVerification> createState() =>
      _GoogleEmailVerificationState();
}

class _GoogleEmailVerificationState extends State<GoogleEmailVerification> {
  final code = TextEditingController();
  bool busy = false;
  int cooldown = 0;
  String? error;
  Timer? timer;
  @override
  void initState() {
    super.initState();
    unawaited(send());
  }

  @override
  void dispose() {
    timer?.cancel();
    code.dispose();
    super.dispose();
  }

  Future<void> send() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await Supabase.instance.client.auth.signInWithOtp(
          email: widget.profile['email'],
          shouldCreateUser: false,
          emailRedirectTo: authCallbackUrl());
      if (!mounted) return;
      setState(() => cooldown = 60);
      timer?.cancel();
      timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) {
          t.cancel();
          return;
        }
        setState(() => cooldown--);
        if (cooldown == 0) t.cancel();
      });
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> verify() async {
    if (!RegExp(r'^\d{6,8}$').hasMatch(code.text)) {
      setState(() => error = 'Enter the code from your email.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await Supabase.instance.client.auth.verifyOTP(
          email: widget.profile['email'],
          token: code.text,
          type: OtpType.email);
      await widget.onVerified();
    } catch (e) {
      if (mounted) setState(() => error = readableError(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Verify your email')),
      body: SafeArea(
          child: ListView(padding: const EdgeInsets.all(28), children: [
        const Icon(Icons.mark_email_read_outlined,
            size: 54, color: Color(0xFF247547)),
        const SizedBox(height: 24),
        const Text('Google connected',
            style: TextStyle(fontSize: 25, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Text(
            'Enter the code or open the verification link sent to ${widget.profile['email']}, then confirm your personal details.'),
        const SizedBox(height: 24),
        TextField(
            controller: code,
            enabled: !busy,
            keyboardType: TextInputType.number,
            maxLength: 8,
            autofillHints: const [AutofillHints.oneTimeCode],
            decoration: const InputDecoration(labelText: 'Verification code')),
        if (error != null)
          Text(error!, style: const TextStyle(color: Colors.red)),
        FilledButton(
            onPressed: busy ? null : verify,
            child: Text(busy ? 'Please wait…' : 'Verify email')),
        TextButton(
            onPressed: busy || cooldown > 0 ? null : send,
            child: Text(cooldown > 0
                ? 'Resend in ${cooldown}s'
                : 'Send verification email'))
      ])));
}
