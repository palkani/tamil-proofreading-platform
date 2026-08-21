/**
 * Disposable / throwaway email domain blocklist.
 *
 * Curated from the disposable-email-domains community list
 * (https://github.com/disposable-email-domains/disposable-email-domains).
 * We ship a static subset (~300 of the most abused providers) instead of
 * the full 3.5k-domain file so this module stays small enough to load on
 * cold-start and easy to review in a diff.
 *
 * Extend at runtime WITHOUT a redeploy: set env var
 *   DISPOSABLE_EMAIL_DOMAINS=example.com,another.io
 * The runtime merges those on top of this static list.
 *
 * To refresh from upstream:
 *   curl -sSL https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf \
 *     | head -1000 > /tmp/list.txt
 * and pick the ones you want to add. Prefer breadth in the most-abused
 * clusters (mailinator, guerrilla, temp, throwaway family).
 *
 * All entries are lowercase, ASCII-normalised. Never add a subdomain of
 * a real provider (e.g. never "student.gmail.com") — subdomain checks
 * happen in validate.js.
 */

const STATIC_BLOCKLIST = new Set([
  // ── mailinator + aliases (top 1 by volume) ─────────────────────────
  'mailinator.com', 'mailinator.net', 'mailinater.com', 'mailinator2.com', 'mailinator2.net',
  'notmailinator.com', 'reallymymail.com', 'reconmail.com', 'safetymail.info', 'sogetthis.com',
  'suremail.info', 'thisisnotmyrealemail.com', 'trbvm.com', 'zippymail.info',
  'binkmail.com', 'bobmail.info', 'chammy.info', 'devnullmail.com', 'letthemeatspam.com',
  'mailin8r.com', 'mailinater.com', 'mailinator.us', 'mailinator.org', 'mvrht.com',
  'objectmail.com', 'proxymail.eu', 'rcpt.at', 'spamherelots.com', 'spamhereplease.com',
  'stuffmail.de', 'suremail.info', 'thisisnotmyrealemail.com', 'tradermail.info',
  'veryrealemail.com', 'webemail.me', 'wilemail.com', 'xoxy.net',

  // ── guerrilla mail + aliases ───────────────────────────────────────
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamail.biz',
  'guerrillamail.de', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la',
  'pokemail.net', 'spam4.me', 'guerrilla-mail.com',

  // ── 10minutemail + aliases ─────────────────────────────────────────
  '10minutemail.com', '10minutemail.net', '10minutemail.org', '10minutemail.de',
  '10minutemail.us', '20minutemail.com', '20minutemail.it', 'my10minutemail.com',
  'tenminutemail.com', 'minutemail.net', 'minutemail.com',

  // ── temp-mail / tempmail / tempinbox family ────────────────────────
  'tempmail.com', 'tempmail.net', 'tempmail.org', 'tempmail.plus', 'tempmail.us',
  'tempmail.email', 'tempmail.io', 'tempmail.co', 'tempmail.dev',
  'temp-mail.org', 'temp-mail.io', 'temp-mail.com', 'temp-mail.online', 'temp-mail.us',
  'temp-mail.de', 'temp-mail.ru', 'temp-mail.plus',
  'tempinbox.com', 'tempinbox.co.uk', 'tempinbox.info',
  'tempmailaddress.com', 'tempmailer.com', 'tempmailo.com', 'tempmailz.com',
  'tempsky.com', 'temporarily.de', 'temporarioemail.com.br',
  'tempthe.net', 'tempymail.com', 'tempail.com', 'tempeamil.com',
  'my-tempmail.com', 'mytempmail.com', 'mytempemail.com',
  'thankyou2010.com', 'trash2009.com',

  // ── yopmail + variants ─────────────────────────────────────────────
  'yopmail.com', 'yopmail.net', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
  'nospam.ze.tc', 'nomail.xl.cx', 'mega.zik.dj', 'speed.1s.fr',
  'courriel.fr.nf', 'moncourrier.fr.nf', 'monemail.fr.nf', 'monmail.fr.nf',
  'yopweb.com', 'yopmail.org',

  // ── throwaway/trash family ─────────────────────────────────────────
  'throwawaymail.com', 'throwam.com', 'throwaway.email', 'throwaway.email.com',
  'trashmail.com', 'trashmail.net', 'trashmail.io', 'trashmail.me', 'trashmail.at',
  'trashmail.ws', 'trashmail.de', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerpmail.net',
  'wegwerf-emails.de', 'wegwerf-email.com', 'wegwerfemail.de', 'wegwerfemail.com',
  'wegwerfemail.info', 'wegwerfemail.net', 'wegwerfemail.org',
  'mytrashmail.com', 'discard.email', 'discardmail.com', 'discardmail.de',
  'dispomail.com', 'disposeamail.com', 'dispostable.com', 'dontsendmespam.de',
  'deadaddress.com', 'mailexpire.com', 'mailtemp.info',

  // ── maildrop / mailcatch / mailnesia ───────────────────────────────
  'maildrop.cc', 'mailcatch.com', 'mailcatch.email', 'mailnesia.com', 'mailnull.com',
  'mailondemand.com', 'mailpick.biz', 'mailsac.com', 'mail-temporaire.fr',
  'mail-temporaire.com', 'moakt.com', 'moakt.co', 'moakt.cc',

  // ── fake mail family ───────────────────────────────────────────────
  'fakemail.net', 'fakemail.com', 'fakemailz.com', 'fake-mail.com', 'fake-mail.ml',
  'fakeinbox.com', 'fakemailgenerator.com', 'fakeinbox.email',

  // ── burner / one-time / minute ─────────────────────────────────────
  'burnermail.io', 'burnermail.com', 'anonymouse.org', 'anonym.to',
  'sneakemail.com', 'jetable.org', 'jetable.com', 'jetable.net',
  'onetimeemail.com', 'onetime.email', 'nowmymail.com', 'now-email.com',
  'minutemail.net', 'minutemail.com',

  // ── dropmail / mintemail / mintemail-family ────────────────────────
  'dropmail.me', 'dropjar.com', 'mintemail.com',

  // ── spam-gourmet / spam-decoy / spamfree family ────────────────────
  'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
  'spambox.us', 'spamfree24.org', 'spamfree24.info', 'spamfree24.eu',
  'spamdecoy.net', 'spamavert.com', 'spam.la', 'spam.su', 'spamherelots.com',
  'spammotel.com',

  // ── mailtothis / mailhaven / etc. ──────────────────────────────────
  'mailtothis.com', 'meltmail.com', 'mierdamail.com', 'mkpfilm.com',
  'mailhaven.com', 'mailimate.com', 'mailfa.tk', 'get2mail.fr',
  'nwldx.com', 'mailmoat.com', 'mailquack.com', 'mailscrap.com',
  'mailtemporaire.com', 'mailtemporaire.fr',

  // ── e4ward / getairmail / spambog family ───────────────────────────
  'e4ward.com', 'getairmail.com', 'spambog.com', 'spambog.de', 'spambog.ru',
  'safe-mail.net',

  // ── mailmetrash / mail4trash / mytemp / mytmp ──────────────────────
  'mail4trash.com', 'mailmetrash.com', 'mytemp.email',

  // ── freundin/hilfe/loaded/schafmail — german/euro cluster ──────────
  'trbvn.com', 'trbvo.com', 'trashinbox.com', 'trashcanmail.com', 'trashymail.com',
  'trashymail.net', 'antichef.net', 'antichef.com', 'antispam.de', 'antispam24.de',
  'bofthew.com', 'brefmail.com', 'chogmail.com', 'crazymailing.com',

  // ── nada / null / vomoto / etc ─────────────────────────────────────
  'nada.email', 'nada.ltd', 'nullbox.info', 'vomoto.com', 'voidbay.com',
  'vpn.st', 'ynmrealty.com',

  // ── kasmail / kismail / etc ────────────────────────────────────────
  'kasmail.com', 'keepmymail.com', 'killmail.com', 'kimo.mineweeper.com',
  'kimsdisk.com', 'kir.ch.tc', 'klassmaster.com', 'klzlk.com', 'koszmail.pl',

  // ── new / recent / trending abuse ──────────────────────────────────
  'mail.tm', 'mail.temp-mail.io', 'mail.temp-mail.pro', 'mail-temp.com',
  'inboxbear.com', 'inboxproxy.com', 'inbox.lv', 'inboxalias.com', 'inboxdesign.me',
  'inboxstore.me', 'imgv.de', 'immo.xyz', 'igorpuzanov.com',
  'harakirimail.com', 'hidemail.de', 'hulapla.de',
  'gishpuppy.com', 'griuc.com',
  'freeletter.me', 'freundin.ru', 'fudgerub.com',
  'emailsensei.com', 'emailtemporario.com.br', 'emailigo.de', 'emailinfive.com',
  'emailthe.net', 'emailwarden.com', 'emailxfer.com', 'emeil.in',
  'emeil.ir', 'emz.net', 'enterto.com', 'epimail.eu', 'eremboo.com',
  'digitalsanctuary.com', 'droplar.com', 'duam.net', 'dumpmail.de',
  'centermail.com', 'centermail.net', 'chogmail.com', 'cliptik.net',
  'consumerriot.com', 'cool.fr.nf', 'correo.blogos.net', 'cosmorph.com',
  'cubiclink.com', 'curryworld.de', 'cust.in',

  // ── new/tricky recent additions ────────────────────────────────────
  'privatemail.com', 'privaterelay.appleid.com', // apple's is legitimate — see note below
]);

// Apple's Private Relay is technically a disposable-forwarding service
// but it IS a legitimate consumer feature backed by a real Apple ID.
// We explicitly ALLOW-list it here because blocking it excludes every
// iOS user who used "Sign in with Apple" (a huge population). If you
// want to be maximally strict at the cost of Apple users, remove this.
const ALLOW_OVERRIDE = new Set([
  'privaterelay.appleid.com',
]);

function extraFromEnv() {
  const raw = process.env.DISPOSABLE_EMAIL_DOMAINS || '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/**
 * Returns true when the given domain (lowercase, no leading dot, exact
 * match — subdomain widening happens in the caller) is on the blocklist
 * and NOT on the allow-override list.
 */
function isDisposableDomain(domain) {
  const d = String(domain || '').toLowerCase().trim();
  if (!d) return false;
  if (ALLOW_OVERRIDE.has(d)) return false;
  if (STATIC_BLOCKLIST.has(d)) return true;
  const extra = extraFromEnv();
  return extra.includes(d);
}

/** Debug: how big is the compiled blocklist right now? */
function size() {
  return STATIC_BLOCKLIST.size + extraFromEnv().length;
}

module.exports = { isDisposableDomain, size };
