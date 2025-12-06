const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { upsertGoogleUser } = require('../models/userModel');

const configurePassport = () => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('[AUTH] Google OAuth credentials are not configured. Google login will fail.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5100/auth/google/callback',
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || profile.name?.givenName || 'User';
          const picture = profile.photos?.[0]?.value || null;

          const user = await upsertGoogleUser({
            googleId: profile.id,
            email,
            name,
            profilePicture: picture,
          });

          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
};

module.exports = configurePassport;

