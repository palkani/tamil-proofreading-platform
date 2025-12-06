const express = require('express');
const router = express.Router();
const auth = require('../lib/auth');
const { createClient } = require('../lib/supabase');
const { getSeoData } = require('../config/seo');

router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email and password are required' 
    });
  }
  
  try {
    const result = await auth.signup(req, res, email, password, name);
    
    if (!result.success) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json(result);
      }
      const seo = getSeoData('register');
      return res.render('pages/register', {
        title: seo.title,
        seo: seo,
        error: result.error,
        googleClientId: process.env.GOOGLE_CLIENT_ID || ''
      });
    }
    
    if (result.needsConfirmation) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({
          success: true,
          message: 'Please check your email to confirm your account',
          needsConfirmation: true
        });
      }
      const seo = getSeoData('login');
      return res.render('pages/login', {
        title: seo.title,
        seo: seo,
        message: 'Registration successful! Please check your email to confirm your account.',
        googleClientId: process.env.GOOGLE_CLIENT_ID || ''
      });
    }
    
    req.session.user = {
      id: result.user.id,
      email: result.user.email,
      name: name || result.user.email.split('@')[0],
      role: email === 'prooftamil@gmail.com' ? 'admin' : 'user',
      supabase: true
    };
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, redirect: '/dashboard' });
    }
    res.redirect('/dashboard');
  } catch (err) {
    console.error('[Auth] Signup error:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: 'Registration failed' });
    }
    const seo = getSeoData('register');
    res.render('pages/register', {
      title: seo.title,
      seo: seo,
      error: 'Registration failed. Please try again.',
      googleClientId: process.env.GOOGLE_CLIENT_ID || ''
    });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email and password are required' 
    });
  }
  
  try {
    const result = await auth.login(req, res, email, password);
    
    if (!result.success) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json(result);
      }
      const seo = getSeoData('login');
      return res.render('pages/login', {
        title: seo.title,
        seo: seo,
        error: result.error,
        googleClientId: process.env.GOOGLE_CLIENT_ID || ''
      });
    }
    
    req.session.user = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.user_metadata?.name || result.user.email.split('@')[0],
      role: email === 'prooftamil@gmail.com' ? 'admin' : 'user',
      supabase: true
    };
    
    const redirectTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, redirect: redirectTo });
    }
    res.redirect(redirectTo);
  } catch (err) {
    console.error('[Auth] Login error:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: 'Login failed' });
    }
    const seo = getSeoData('login');
    res.render('pages/login', {
      title: seo.title,
      seo: seo,
      error: 'Login failed. Please try again.',
      googleClientId: process.env.GOOGLE_CLIENT_ID || ''
    });
  }
});

router.post('/logout', async (req, res) => {
  let responseSent = false;
  try {
    await auth.logout(req, res);
    
    req.session.destroy((err) => {
      if (responseSent) return;
      if (err) {
        console.error('[Auth] Session destroy error:', err);
      }
      responseSent = true;
      res.clearCookie('auth_token');
      
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.json({ success: true, redirect: '/' });
      }
      res.redirect('/');
    });
  } catch (err) {
    if (!responseSent) {
      console.error('[Auth] Logout error:', err);
      responseSent = true;
      req.session.destroy(() => {
        if (!responseSent) {
          responseSent = true;
          res.redirect('/');
        }
      });
    }
  }
});

router.get('/callback', async (req, res) => {
  res.render('pages/auth-callback', {
    title: 'Signing in... - ProofTamil'
  });
});

router.post('/sync-session', async (req, res) => {
  const { user, access_token, refresh_token } = req.body;
  
  if (!user || !user.id) {
    return res.status(400).json({ success: false, error: 'Invalid user data' });
  }
  
  let responseSent = false;
  
  try {
    const isProduction = process.env.NODE_ENV === 'production' || 
                         (process.env.BACKEND_URL && process.env.BACKEND_URL.includes('run.app')) ||
                         (req.get('host') && req.get('host').includes('prooftamil.com'));
    
    console.log('[Auth] Sync session - isProduction:', isProduction, 'host:', req.get('host'));
    
    if (access_token && refresh_token) {
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 365 * 24 * 60 * 60 * 1000,
        path: '/',
        domain: isProduction ? '.prooftamil.com' : undefined
      };
      
      const supabaseProjectId = (process.env.VITE_SUPABASE_URL || '').match(/https:\/\/([^.]+)/)?.[1] || 'project';
      res.cookie(`sb-${supabaseProjectId}-auth-token`, JSON.stringify({
        access_token,
        refresh_token,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user
      }), cookieOptions);
      console.log('[Auth] Supabase cookie set with domain:', cookieOptions.domain);
    }
    
    req.session.user = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0],
      role: user.email === 'prooftamil@gmail.com' ? 'admin' : 'user',
      supabase: true,
      syncedAt: Date.now()
    };
    
    req.session.save((err) => {
      if (responseSent) return;
      
      if (err) {
        console.error('[Auth] Session save error:', err);
        responseSent = true;
        return res.status(500).json({ success: false, error: 'Failed to save session' });
      }
      console.log('[Auth] Session saved for user:', user.email, 'session ID:', req.sessionID);
      responseSent = true;
      res.json({ success: true, sessionId: req.sessionID });
    });
  } catch (err) {
    if (!responseSent) {
      console.error('[Auth] Sync session error:', err);
      responseSent = true;
      res.status(500).json({ success: false, error: 'Failed to sync session' });
    }
  }
});

router.get('/google', async (req, res) => {
  try {
    const result = await auth.signInWithGoogle(req, res);
    
    if (!result.success) {
      return res.redirect('/login?error=' + encodeURIComponent(result.error));
    }
    
    res.redirect(result.url);
  } catch (err) {
    console.error('[Auth] Google OAuth error:', err);
    res.redirect('/login?error=Google authentication failed');
  }
});

router.post('/reset-password', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  
  try {
    const result = await auth.resetPassword(req, res, email);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json({ 
      success: true, 
      message: 'Password reset email sent. Please check your inbox.' 
    });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ success: false, error: 'Failed to send reset email' });
  }
});

router.get('/reset-password', (req, res) => {
  const seo = getSeoData('resetPassword') || { title: 'Reset Password - ProofTamil' };
  res.render('pages/reset-password', {
    title: seo.title,
    seo: seo
  });
});

router.post('/update-password', async (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password is required' });
  }
  
  try {
    const result = await auth.updatePassword(req, res, password);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('[Auth] Update password error:', err);
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
});

router.get('/confirm', async (req, res) => {
  const { token_hash, type } = req.query;
  const supabase = createClient(req, res);
  
  if (token_hash && type) {
    try {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      
      if (error) {
        return res.redirect('/login?error=' + encodeURIComponent(error.message));
      }
    } catch (err) {
      return res.redirect('/login?error=Verification failed');
    }
  }
  
  res.redirect('/login?message=Email confirmed! Please login.');
});

module.exports = router;
