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
  prepareLevelFour,
  readLevelFourInput,
} from "../../../src/application/scheduling/prepare-level-four";
import {
  prepareLevelFive,
  readLevelFiveInput,
} from "../../../src/application/scheduling/prepare-level-five";
import {
  prepareLevelSix,
  readLevelSixInput,
} from "../../../src/application/scheduling/prepare-level-six";
import {
  prepareLevelSeven,
  readLevelSevenInput,
} from "../../../src/application/scheduling/prepare-level-seven";
import {
  prepareLevelEight,
  readLevelEightInput,
} from "../../../src/application/scheduling/prepare-level-eight";
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
  4: { validate: readLevelFourInput, generate: prepareLevelFour },
  5: { validate: readLevelFiveInput, generate: prepareLevelFive },
  6: { validate: readLevelSixInput, generate: prepareLevelSix },
  7: { validate: readLevelSevenInput, generate: prepareLevelSeven },
  8: { validate: readLevelEightInput, generate: prepareLevelEight },
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
    const level = body.level === undefined ? 8 : body.level;
    if (typeof level !== "number" || !Object.prototype.hasOwnProperty.call(levels, level)) {
      return NextResponse.json({ error: "El nivel debe estar entre 0 y 8." }, { status: 400 });
    }
    const { validate, generate } = levels[level as keyof typeof levels];
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
