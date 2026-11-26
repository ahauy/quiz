import { randomInt } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export abstract class ClassCodeGenerator {
  abstract generate(): string;
}

export class CryptoClassCodeGenerator extends ClassCodeGenerator {
  override generate(): string {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
    }
    return code;
  }
}
