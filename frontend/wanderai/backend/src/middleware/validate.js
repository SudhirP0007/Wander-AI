// Lightweight, dependency-free request validation (FR-03: client- and
// server-side input validation with error messages).
//
// Usage: validate({ body: { destination: [isRequired, isString] } })

const isRequired = (v) => (v === undefined || v === null || v === '' ? 'This field is required.' : null);
const isString = (v) => (typeof v !== 'string' ? 'Must be text.' : null);
const isNumber = (v) => (v === undefined || v === null || Number.isNaN(Number(v)) ? 'Must be a number.' : null);
const isPositive = (v) => (Number(v) < 0 ? 'Must be zero or greater.' : null);
const isDate = (v) => (Number.isNaN(Date.parse(v)) ? 'Must be a valid date.' : null);
const isEmail = (v) => (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Must be a valid email address.' : null);
const minLength = (n) => (v) => (typeof v === 'string' && v.length < n ? `Must be at least ${n} characters.` : null);
const isArray = (v) => (!Array.isArray(v) ? 'Must be a list.' : null);
const oneOf = (options) => (v) => (v !== undefined && v !== null && v !== '' && !options.includes(v) ? `Must be one of: ${options.join(', ')}.` : null);

function validate(rules) {
  return (req, res, next) => {
    const errors = {};
    for (const section of Object.keys(rules)) {
      const data = req[section] || {};
      for (const field of Object.keys(rules[section])) {
        const validators = rules[section][field];
        for (const fn of validators) {
          const msg = fn(data[field]);
          if (msg) {
            errors[field] = msg;
            break;
          }
        }
      }
    }
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Validation failed.', fields: errors });
    }
    next();
  };
}

module.exports = {
  validate,
  isRequired,
  isString,
  isNumber,
  isPositive,
  isDate,
  isEmail,
  minLength,
  isArray,
  oneOf,
};
