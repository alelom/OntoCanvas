// shacl-engine ships no types: validateShapes.ts types the part of its Validator it uses (ValidatorClass).
declare module 'shacl-engine/Validator.js' {
  const Validator: unknown;
  export default Validator;
}
