const { createClient, getUser, getSession } = require('./supabase');

async function signup(req, res, email, password, name = '') {
  const supabase = createClient(req, res);
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name,
        full_name: name
      }
    }
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { 
    success: true, 
    user: data.user,
    session: data.session,
    needsConfirmation: !data.session
  };
}

async function login(req, res, email, password) {
  const supabase = createClient(req, res);
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { 
    success: true, 
    user: data.user,
    session: data.session
  };
}

async function logout(req, res) {
  const supabase = createClient(req, res);
  
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

async function getCurrentUser(req, res) {
  return await getUser(req, res);
}

async function getCurrentSession(req, res) {
  return await getSession(req, res);
}

async function resetPassword(req, res, email) {
  const supabase = createClient(req, res);
  
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.BASE_URL || 'https://prooftamil.com'}/auth/reset-password`
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

async function updatePassword(req, res, newPassword) {
  const supabase = createClient(req, res);
  
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, user: data.user };
}

async function signInWithGoogle(req, res) {
  const supabase = createClient(req, res);
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${process.env.BASE_URL || 'https://prooftamil.com'}/auth/callback`
    }
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, url: data.url };
}

async function exchangeCodeForSession(req, res, code) {
  const supabase = createClient(req, res);
  
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, session: data.session, user: data.user };
}

module.exports = {
  signup,
  login,
  logout,
  getCurrentUser,
  getCurrentSession,
  resetPassword,
  updatePassword,
  signInWithGoogle,
  exchangeCodeForSession
};
