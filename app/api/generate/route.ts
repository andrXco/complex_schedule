import { NextResponse } from "next/server";
import {
  prepareLevelOne,
  readLevelOneInput,
} from "../../../src/application/scheduling/prepare-level-one";
import {
  prepareLevelTwo,
  readLevelTwoInput,
} from "../../../src/application/scheduling/prepare-level-two";
import { prepareLevelThree } from "../../../src/application/scheduling/prepare-level-three";
import {
  prepareLevelZero,
  readLevelZeroCourses,
} from "../../../src/application/scheduling/prepare-level-zero";

export const runtime = "nodejs";

const levels = {
  0: { validate: readLevelZeroCourses, generate: prepareLevelZero },
  1: { validate: readLevelOneInput, generate: prepareLevelOne },
  2: { validate: readLevelTwoInput, generate: prepareLevelTwo },
  3: { validate: readLevelTwoInput, generate: prepareLevelThree },
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sourceJson?: unknown;
      validateOnly?: boolean;
      level?: unknown;
    } | null;
    if (body?.sourceJson === undefined) {
      return NextResponse.json({ error: "Envía el contenido del archivo JSON." }, { status: 400 });
    }
    const level = body.level === undefined ? 3 : body.level;
    if (level !== 0 && level !== 1 && level !== 2 && level !== 3) {
      return NextResponse.json({ error: "El nivel debe estar entre 0 y 3." }, { status: 400 });
    }
    const { validate, generate } = levels[level];
    if (body.validateOnly === true) {
      validate(body.sourceJson);
      return NextResponse.json({ valid: true });
    }
    return NextResponse.json({ ...generate(body.sourceJson), level });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el horario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
