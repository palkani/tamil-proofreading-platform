const { getUser, getSession, createClient } = require('../lib/supabase');

async function supabaseAuthMiddleware(req, res, next) {
  try {
    const user = await getUser(req, res);
    
    if (user) {
      req.supabaseUser = user;
      req.session.user = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.user_metadata?.full_name || user.email.split('@')[0],
        role: user.email === 'prooftamil@gmail.com' ? 'admin' : 'user',
        supabase: true,
        syncedAt: Date.now()
      };
      res.locals.user = req.session.user;
    } else if (req.session?.user?.supabase) {
      const syncedAt = req.session.user.syncedAt || 0;
      const timeSinceSync = Date.now() - syncedAt;
      const GRACE_PERIOD = 60 * 60 * 1000;
      
      if (timeSinceSync < GRACE_PERIOD) {
        res.locals.user = req.session.user;
      } else {
        console.log('[Auth Middleware] Supabase session expired, clearing session');
        delete req.session.user;
        res.locals.user = null;
      }
    } else if (req.session?.user) {
      res.locals.user = req.session.user;
    } else {
      res.locals.user = null;
    }
    
    req.supabase = createClient(req, res);
    
    next();
  } catch (err) {
    console.error('[Auth Middleware] Error:', err.message);
    if (req.session?.user) {
      res.locals.user = req.session.user;
    } else {
      res.locals.user = null;
    }
    next();
  }
}

function requireAuth(req, res, next) {
  const user = req.session?.user || req.supabaseUser;
  
  if (user) {
    return next();
  }
  
  req.session.returnTo = req.originalUrl;
  res.redirect('/login?error=Please login to access this page');
}

function redirectIfAuth(req, res, next) {
  const user = req.session?.user || req.supabaseUser;
  
  if (user) {
    return res.redirect('/dashboard');
  }
  next();
}

function getCurrentUser(req) {
  return req.session?.user || req.supabaseUser || null;
}

async function requireAuthAsync(req, res, next) {
  try {
    const user = await getUser(req, res);
    
    if (user || req.session?.user) {
      req.currentUser = user || req.session.user;
      return next();
    }
    
    req.session.returnTo = req.originalUrl;
    res.redirect('/login?error=Please login to access this page');
  } catch (err) {
    console.error('[RequireAuth] Error:', err.message);
    if (req.session?.user) {
      return next();
    }
    res.redirect('/login?error=Authentication error');
  }
}

function requireAdmin(req, res, next) {
  const user = req.session?.user || req.supabaseUser;
  
  if (!user) {
    return res.redirect('/login?error=Please login');
  }
  
  if (user.email !== 'prooftamil@gmail.com' && user.role !== 'admin') {
    return res.status(403).render('pages/error', {
      title: 'Access Denied',
      message: 'You do not have permission to view this page.',
      user: user
    });
  }
  
  next();
}

module.exports = {
  supabaseAuthMiddleware,
  requireAuth,
  redirectIfAuth,
  getCurrentUser,
  requireAuthAsync,
  requireAdmin
};
