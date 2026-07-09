/**
 * Country data for the phone-number country picker.
 * `dial` is the international calling code with the leading "+".
 * `flag` is the Unicode emoji flag (renders natively on modern OSes).
 *
 * Jamaica intentionally appears first so it's the default for our pilot launch.
 */

export type Country = {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  dial: string;
  flag: string;
};

export const COUNTRIES: Country[] = [
  { code: "JM", name: "Jamaica", dial: "+1", flag: "🇯🇲" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { code: "AF", name: "Afghanistan", dial: "+93", flag: "🇦🇫" },
  { code: "AL", name: "Albania", dial: "+355", flag: "🇦🇱" },
  { code: "DZ", name: "Algeria", dial: "+213", flag: "🇩🇿" },
  { code: "AD", name: "Andorra", dial: "+376", flag: "🇦🇩" },
  { code: "AO", name: "Angola", dial: "+244", flag: "🇦🇴" },
  { code: "AG", name: "Antigua and Barbuda", dial: "+1", flag: "🇦🇬" },
  { code: "AR", name: "Argentina", dial: "+54", flag: "🇦🇷" },
  { code: "AM", name: "Armenia", dial: "+374", flag: "🇦🇲" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { code: "AT", name: "Austria", dial: "+43", flag: "🇦🇹" },
  { code: "AZ", name: "Azerbaijan", dial: "+994", flag: "🇦🇿" },
  { code: "BS", name: "Bahamas", dial: "+1", flag: "🇧🇸" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭" },
  { code: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩" },
  { code: "BB", name: "Barbados", dial: "+1", flag: "🇧🇧" },
  { code: "BY", name: "Belarus", dial: "+375", flag: "🇧🇾" },
  { code: "BE", name: "Belgium", dial: "+32", flag: "🇧🇪" },
  { code: "BZ", name: "Belize", dial: "+501", flag: "🇧🇿" },
  { code: "BJ", name: "Benin", dial: "+229", flag: "🇧🇯" },
  { code: "BT", name: "Bhutan", dial: "+975", flag: "🇧🇹" },
  { code: "BO", name: "Bolivia", dial: "+591", flag: "🇧🇴" },
  { code: "BA", name: "Bosnia and Herzegovina", dial: "+387", flag: "🇧🇦" },
  { code: "BW", name: "Botswana", dial: "+267", flag: "🇧🇼" },
  { code: "BR", name: "Brazil", dial: "+55", flag: "🇧🇷" },
  { code: "BN", name: "Brunei", dial: "+673", flag: "🇧🇳" },
  { code: "BG", name: "Bulgaria", dial: "+359", flag: "🇧🇬" },
  { code: "BF", name: "Burkina Faso", dial: "+226", flag: "🇧🇫" },
  { code: "BI", name: "Burundi", dial: "+257", flag: "🇧🇮" },
  { code: "KH", name: "Cambodia", dial: "+855", flag: "🇰🇭" },
  { code: "CM", name: "Cameroon", dial: "+237", flag: "🇨🇲" },
  { code: "CV", name: "Cape Verde", dial: "+238", flag: "🇨🇻" },
  { code: "CF", name: "Central African Republic", dial: "+236", flag: "🇨🇫" },
  { code: "TD", name: "Chad", dial: "+235", flag: "🇹🇩" },
  { code: "CL", name: "Chile", dial: "+56", flag: "🇨🇱" },
  { code: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { code: "CO", name: "Colombia", dial: "+57", flag: "🇨🇴" },
  { code: "KM", name: "Comoros", dial: "+269", flag: "🇰🇲" },
  { code: "CG", name: "Congo", dial: "+242", flag: "🇨🇬" },
  { code: "CD", name: "Congo (DRC)", dial: "+243", flag: "🇨🇩" },
  { code: "CR", name: "Costa Rica", dial: "+506", flag: "🇨🇷" },
  { code: "CI", name: "Côte d'Ivoire", dial: "+225", flag: "🇨🇮" },
  { code: "HR", name: "Croatia", dial: "+385", flag: "🇭🇷" },
  { code: "CU", name: "Cuba", dial: "+53", flag: "🇨🇺" },
  { code: "CY", name: "Cyprus", dial: "+357", flag: "🇨🇾" },
  { code: "CZ", name: "Czech Republic", dial: "+420", flag: "🇨🇿" },
  { code: "DK", name: "Denmark", dial: "+45", flag: "🇩🇰" },
  { code: "DJ", name: "Djibouti", dial: "+253", flag: "🇩🇯" },
  { code: "DM", name: "Dominica", dial: "+1", flag: "🇩🇲" },
  { code: "DO", name: "Dominican Republic", dial: "+1", flag: "🇩🇴" },
  { code: "EC", name: "Ecuador", dial: "+593", flag: "🇪🇨" },
  { code: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬" },
  { code: "SV", name: "El Salvador", dial: "+503", flag: "🇸🇻" },
  { code: "GQ", name: "Equatorial Guinea", dial: "+240", flag: "🇬🇶" },
  { code: "ER", name: "Eritrea", dial: "+291", flag: "🇪🇷" },
  { code: "EE", name: "Estonia", dial: "+372", flag: "🇪🇪" },
  { code: "SZ", name: "Eswatini", dial: "+268", flag: "🇸🇿" },
  { code: "ET", name: "Ethiopia", dial: "+251", flag: "🇪🇹" },
  { code: "FJ", name: "Fiji", dial: "+679", flag: "🇫🇯" },
  { code: "FI", name: "Finland", dial: "+358", flag: "🇫🇮" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { code: "GA", name: "Gabon", dial: "+241", flag: "🇬🇦" },
  { code: "GM", name: "Gambia", dial: "+220", flag: "🇬🇲" },
  { code: "GE", name: "Georgia", dial: "+995", flag: "🇬🇪" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { code: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { code: "GR", name: "Greece", dial: "+30", flag: "🇬🇷" },
  { code: "GD", name: "Grenada", dial: "+1", flag: "🇬🇩" },
  { code: "GT", name: "Guatemala", dial: "+502", flag: "🇬🇹" },
  { code: "GN", name: "Guinea", dial: "+224", flag: "🇬🇳" },
  { code: "GW", name: "Guinea-Bissau", dial: "+245", flag: "🇬🇼" },
  { code: "GY", name: "Guyana", dial: "+592", flag: "🇬🇾" },
  { code: "HT", name: "Haiti", dial: "+509", flag: "🇭🇹" },
  { code: "HN", name: "Honduras", dial: "+504", flag: "🇭🇳" },
  { code: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰" },
  { code: "HU", name: "Hungary", dial: "+36", flag: "🇭🇺" },
  { code: "IS", name: "Iceland", dial: "+354", flag: "🇮🇸" },
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", dial: "+62", flag: "🇮🇩" },
  { code: "IR", name: "Iran", dial: "+98", flag: "🇮🇷" },
  { code: "IQ", name: "Iraq", dial: "+964", flag: "🇮🇶" },
  { code: "IE", name: "Ireland", dial: "+353", flag: "🇮🇪" },
  { code: "IL", name: "Israel", dial: "+972", flag: "🇮🇱" },
  { code: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵" },
  { code: "JO", name: "Jordan", dial: "+962", flag: "🇯🇴" },
  { code: "KZ", name: "Kazakhstan", dial: "+7", flag: "🇰🇿" },
  { code: "KE", name: "Kenya", dial: "+254", flag: "🇰🇪" },
  { code: "KI", name: "Kiribati", dial: "+686", flag: "🇰🇮" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼" },
  { code: "KG", name: "Kyrgyzstan", dial: "+996", flag: "🇰🇬" },
  { code: "LA", name: "Laos", dial: "+856", flag: "🇱🇦" },
  { code: "LV", name: "Latvia", dial: "+371", flag: "🇱🇻" },
  { code: "LB", name: "Lebanon", dial: "+961", flag: "🇱🇧" },
  { code: "LS", name: "Lesotho", dial: "+266", flag: "🇱🇸" },
  { code: "LR", name: "Liberia", dial: "+231", flag: "🇱🇷" },
  { code: "LY", name: "Libya", dial: "+218", flag: "🇱🇾" },
  { code: "LI", name: "Liechtenstein", dial: "+423", flag: "🇱🇮" },
  { code: "LT", name: "Lithuania", dial: "+370", flag: "🇱🇹" },
  { code: "LU", name: "Luxembourg", dial: "+352", flag: "🇱🇺" },
  { code: "MO", name: "Macau", dial: "+853", flag: "🇲🇴" },
  { code: "MG", name: "Madagascar", dial: "+261", flag: "🇲🇬" },
  { code: "MW", name: "Malawi", dial: "+265", flag: "🇲🇼" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾" },
  { code: "MV", name: "Maldives", dial: "+960", flag: "🇲🇻" },
  { code: "ML", name: "Mali", dial: "+223", flag: "🇲🇱" },
  { code: "MT", name: "Malta", dial: "+356", flag: "🇲🇹" },
  { code: "MR", name: "Mauritania", dial: "+222", flag: "🇲🇷" },
  { code: "MU", name: "Mauritius", dial: "+230", flag: "🇲🇺" },
  { code: "MX", name: "Mexico", dial: "+52", flag: "🇲🇽" },
  { code: "MD", name: "Moldova", dial: "+373", flag: "🇲🇩" },
  { code: "MC", name: "Monaco", dial: "+377", flag: "🇲🇨" },
  { code: "MN", name: "Mongolia", dial: "+976", flag: "🇲🇳" },
  { code: "ME", name: "Montenegro", dial: "+382", flag: "🇲🇪" },
  { code: "MA", name: "Morocco", dial: "+212", flag: "🇲🇦" },
  { code: "MZ", name: "Mozambique", dial: "+258", flag: "🇲🇿" },
  { code: "MM", name: "Myanmar", dial: "+95", flag: "🇲🇲" },
  { code: "NA", name: "Namibia", dial: "+264", flag: "🇳🇦" },
  { code: "NP", name: "Nepal", dial: "+977", flag: "🇳🇵" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿" },
  { code: "NI", name: "Nicaragua", dial: "+505", flag: "🇳🇮" },
  { code: "NE", name: "Niger", dial: "+227", flag: "🇳🇪" },
  { code: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { code: "KP", name: "North Korea", dial: "+850", flag: "🇰🇵" },
  { code: "MK", name: "North Macedonia", dial: "+389", flag: "🇲🇰" },
  { code: "NO", name: "Norway", dial: "+47", flag: "🇳🇴" },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲" },
  { code: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰" },
  { code: "PS", name: "Palestine", dial: "+970", flag: "🇵🇸" },
  { code: "PA", name: "Panama", dial: "+507", flag: "🇵🇦" },
  { code: "PG", name: "Papua New Guinea", dial: "+675", flag: "🇵🇬" },
  { code: "PY", name: "Paraguay", dial: "+595", flag: "🇵🇾" },
  { code: "PE", name: "Peru", dial: "+51", flag: "🇵🇪" },
  { code: "PH", name: "Philippines", dial: "+63", flag: "🇵🇭" },
  { code: "PL", name: "Poland", dial: "+48", flag: "🇵🇱" },
  { code: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { code: "PR", name: "Puerto Rico", dial: "+1", flag: "🇵🇷" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦" },
  { code: "RO", name: "Romania", dial: "+40", flag: "🇷🇴" },
  { code: "RU", name: "Russia", dial: "+7", flag: "🇷🇺" },
  { code: "RW", name: "Rwanda", dial: "+250", flag: "🇷🇼" },
  { code: "KN", name: "Saint Kitts and Nevis", dial: "+1", flag: "🇰🇳" },
  { code: "LC", name: "Saint Lucia", dial: "+1", flag: "🇱🇨" },
  { code: "VC", name: "Saint Vincent and the Grenadines", dial: "+1", flag: "🇻🇨" },
  { code: "WS", name: "Samoa", dial: "+685", flag: "🇼🇸" },
  { code: "SM", name: "San Marino", dial: "+378", flag: "🇸🇲" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { code: "SN", name: "Senegal", dial: "+221", flag: "🇸🇳" },
  { code: "RS", name: "Serbia", dial: "+381", flag: "🇷🇸" },
  { code: "SC", name: "Seychelles", dial: "+248", flag: "🇸🇨" },
  { code: "SL", name: "Sierra Leone", dial: "+232", flag: "🇸🇱" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { code: "SK", name: "Slovakia", dial: "+421", flag: "🇸🇰" },
  { code: "SI", name: "Slovenia", dial: "+386", flag: "🇸🇮" },
  { code: "SO", name: "Somalia", dial: "+252", flag: "🇸🇴" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { code: "KR", name: "South Korea", dial: "+82", flag: "🇰🇷" },
  { code: "SS", name: "South Sudan", dial: "+211", flag: "🇸🇸" },
  { code: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { code: "LK", name: "Sri Lanka", dial: "+94", flag: "🇱🇰" },
  { code: "SD", name: "Sudan", dial: "+249", flag: "🇸🇩" },
  { code: "SR", name: "Suriname", dial: "+597", flag: "🇸🇷" },
  { code: "SE", name: "Sweden", dial: "+46", flag: "🇸🇪" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭" },
  { code: "SY", name: "Syria", dial: "+963", flag: "🇸🇾" },
  { code: "TW", name: "Taiwan", dial: "+886", flag: "🇹🇼" },
  { code: "TJ", name: "Tajikistan", dial: "+992", flag: "🇹🇯" },
  { code: "TZ", name: "Tanzania", dial: "+255", flag: "🇹🇿" },
  { code: "TH", name: "Thailand", dial: "+66", flag: "🇹🇭" },
  { code: "TL", name: "Timor-Leste", dial: "+670", flag: "🇹🇱" },
  { code: "TG", name: "Togo", dial: "+228", flag: "🇹🇬" },
  { code: "TO", name: "Tonga", dial: "+676", flag: "🇹🇴" },
  { code: "TT", name: "Trinidad and Tobago", dial: "+1", flag: "🇹🇹" },
  { code: "TN", name: "Tunisia", dial: "+216", flag: "🇹🇳" },
  { code: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷" },
  { code: "TM", name: "Turkmenistan", dial: "+993", flag: "🇹🇲" },
  { code: "UG", name: "Uganda", dial: "+256", flag: "🇺🇬" },
  { code: "UA", name: "Ukraine", dial: "+380", flag: "🇺🇦" },
  { code: "AE", name: "United Arab Emirates", dial: "+971", flag: "🇦🇪" },
  { code: "UY", name: "Uruguay", dial: "+598", flag: "🇺🇾" },
  { code: "UZ", name: "Uzbekistan", dial: "+998", flag: "🇺🇿" },
  { code: "VU", name: "Vanuatu", dial: "+678", flag: "🇻🇺" },
  { code: "VA", name: "Vatican City", dial: "+39", flag: "🇻🇦" },
  { code: "VE", name: "Venezuela", dial: "+58", flag: "🇻🇪" },
  { code: "VN", name: "Vietnam", dial: "+84", flag: "🇻🇳" },
  { code: "YE", name: "Yemen", dial: "+967", flag: "🇾🇪" },
  { code: "ZM", name: "Zambia", dial: "+260", flag: "🇿🇲" },
  { code: "ZW", name: "Zimbabwe", dial: "+263", flag: "🇿🇼" },
];

export const DEFAULT_COUNTRY: Country = COUNTRIES[0]; // Jamaica

/** Find a country by ISO code; falls back to the default. */
export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? DEFAULT_COUNTRY;
}

/**
 * Per-country phone number metadata used by AuthPhoneField (spacing,
 * length validation, placeholder). Kept as a SEPARATE lookup (not fields
 * on `Country`) so the primary COUNTRIES table stays pure data — the
 * format table is opinionated (each country needs its national number
 * plan researched) and I've only populated the entries that Rajlo
 * actually needs: Jamaica + the countries a Jamaican rider or their
 * diaspora is realistically going to sign up from.
 *
 * `nsn` is the National Significant Number length (digits AFTER the
 * dial code), either exact or a range for countries with variable-length
 * numbering plans (Germany, Brazil, etc.).
 *
 * `template` is a spacing template — `#` marks a digit slot, everything
 * else is inserted verbatim. e.g. `"### ### ####"` for +1-region 10-digit
 * numbers renders 876 555 0123.
 *
 * Countries NOT in this table fall through to a generic path: no length
 * validation, generic placeholder from the caller, no reformatting. That
 * matches the previous behaviour for every country — we only *add*
 * strictness for the countries we know.
 */
export type PhoneFormat = {
  nsn: number | { min: number; max: number };
  template: string;
};

const PHONE_FORMATS: Record<string, PhoneFormat> = {
  // NANP (North American Numbering Plan) — every +1 country uses the
  // same 10-digit "### ### ####" layout, so they're all populated the
  // same way. Not just US/CA — the Caribbean +1 territories (JM/BS/BB/
  // TT/etc.) share the same plan.
  JM: { nsn: 10, template: "### ### ####" },
  US: { nsn: 10, template: "### ### ####" },
  CA: { nsn: 10, template: "### ### ####" },
  BS: { nsn: 10, template: "### ### ####" },
  BB: { nsn: 10, template: "### ### ####" },
  TT: { nsn: 10, template: "### ### ####" },
  DO: { nsn: 10, template: "### ### ####" },
  PR: { nsn: 10, template: "### ### ####" },
  AG: { nsn: 10, template: "### ### ####" },
  GD: { nsn: 10, template: "### ### ####" },
  LC: { nsn: 10, template: "### ### ####" },
  VC: { nsn: 10, template: "### ### ####" },
  KN: { nsn: 10, template: "### ### ####" },
  DM: { nsn: 10, template: "### ### ####" },
  // UK — mobiles are 10 digits after the +44 (leading `0` dropped).
  // "7911 123456" style: 4-6 split.
  GB: { nsn: 10, template: "#### ######" },
  // Ireland mobile is 9 digits after +353 (leading 0 dropped).
  IE: { nsn: 9, template: "## ### ####" },
  // Common diaspora + tourist source countries.
  NG: { nsn: 10, template: "### ### ####" },
  GH: { nsn: 9, template: "## ### ####" },
  KE: { nsn: 9, template: "### ### ###" },
  ZA: { nsn: 9, template: "## ### ####" },
  IN: { nsn: 10, template: "##### #####" },
  AU: { nsn: 9, template: "### ### ###" },
  NZ: { nsn: 9, template: "## ### ####" },
  DE: { nsn: { min: 10, max: 11 }, template: "### #######" },
  FR: { nsn: 9, template: "# ## ## ## ##" },
  ES: { nsn: 9, template: "### ### ###" },
  IT: { nsn: 10, template: "### ### ####" },
  NL: { nsn: 9, template: "# ## ## ## ##" },
  BR: { nsn: { min: 10, max: 11 }, template: "## #####-####" },
  MX: { nsn: 10, template: "### ### ####" },
  CN: { nsn: 11, template: "### #### ####" },
  JP: { nsn: 10, template: "## #### ####" },
  KR: { nsn: { min: 9, max: 10 }, template: "## #### ####" },
  PH: { nsn: 10, template: "### ### ####" },
  ID: { nsn: { min: 9, max: 12 }, template: "### ### ####" },
  SG: { nsn: 8, template: "#### ####" },
  MY: { nsn: { min: 9, max: 10 }, template: "## ### ####" },
  HK: { nsn: 8, template: "#### ####" },
  AE: { nsn: 9, template: "## ### ####" },
  SA: { nsn: 9, template: "## ### ####" },
  EG: { nsn: 10, template: "### ### ####" },
  TR: { nsn: 10, template: "### ### ####" },
};

export function getPhoneFormat(country: Country): PhoneFormat | null {
  return PHONE_FORMATS[country.code] ?? null;
}

/** Min/max National Significant Number length for `country`. Returns
 *  null for countries without a registered format — callers should
 *  treat that as "any length ≥ 4 acceptable" (loose validation). */
export function nsnLengthRange(
  country: Country,
): { min: number; max: number } | null {
  const f = PHONE_FORMATS[country.code];
  if (!f) return null;
  return typeof f.nsn === "number"
    ? { min: f.nsn, max: f.nsn }
    : f.nsn;
}

/** Cap length used to trim the input as the user types. Falls back to
 *  E.164's max (15 digits) for unknown countries so we don't silently
 *  cut off a valid number just because we don't recognise the plan. */
export function maxNsnLength(country: Country): number {
  return nsnLengthRange(country)?.max ?? 15;
}

/** Apply `country`'s spacing template to a raw digits string. Extra
 *  digits beyond the template's `#` slots are appended without spacing
 *  (defensive — the input cap should prevent this, but if it happens we
 *  don't want to drop characters silently). Digits shorter than the
 *  template just render whatever's typed so far — no phantom spaces
 *  hanging off the end. Countries without a format return raw digits. */
export function formatNSN(country: Country, digits: string): string {
  const format = PHONE_FORMATS[country.code];
  if (!format) return digits;
  let out = "";
  let di = 0;
  for (
    let ti = 0;
    ti < format.template.length && di < digits.length;
    ti++
  ) {
    if (format.template[ti] === "#") {
      out += digits[di++];
    } else {
      out += format.template[ti];
    }
  }
  if (di < digits.length) out += digits.slice(di);
  return out;
}

/** Placeholder shown in the input for a given country. We render the
 *  template with `#` characters instead of example digits — visually
 *  communicates "N digit slots with THIS spacing pattern" without
 *  implying a specific-looking real number the visitor might mistake
 *  for a required prefix. Returns null for unknown countries so the
 *  caller can fall back to whatever generic placeholder it wants. */
export function phonePlaceholder(country: Country): string | null {
  return PHONE_FORMATS[country.code]?.template ?? null;
}

export type PhoneValidity = "empty" | "short" | "long" | "ok";

/** Validate a raw-digits NSN against `country`'s format. */
export function validatePhoneDigits(
  country: Country,
  digits: string,
): PhoneValidity {
  if (digits.length === 0) return "empty";
  const range = nsnLengthRange(country);
  // Unknown-format countries: only reject truly implausible short input.
  if (!range) return digits.length >= 4 ? "ok" : "short";
  if (digits.length < range.min) return "short";
  if (digits.length > range.max) return "long";
  return "ok";
}
