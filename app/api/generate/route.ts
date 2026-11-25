import { NextResponse } from "next/server";
import {
  prepareLevelOne,
  readLevelOneInput,
} from "../../../src/application/scheduling/prepare-level-one";
import {
  prepareLevelTwo,
  readLevelTwoInput,
} from "../../../src/application/scheduling/prepare-level-two";
import {
  prepareLevelZero,
  readLevelZeroCourses,
} from "../../../src/application/scheduling/prepare-level-zero";

export const runtime = "nodejs";

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
    const level = body.level === undefined ? 2 : body.level;
    if (level !== 0 && level !== 1 && level !== 2) {
      return NextResponse.json({ error: "El nivel debe ser 0, 1 o 2." }, { status: 400 });
    }
    if (body.validateOnly === true) {
      if (level === 0) readLevelZeroCourses(body.sourceJson);
      else if (level === 1) readLevelOneInput(body.sourceJson);
      else readLevelTwoInput(body.sourceJson);
      return NextResponse.json({ valid: true });
    }
    if (level === 0) return NextResponse.json({ level, ...prepareLevelZero(body.sourceJson) });
    if (level === 1) return NextResponse.json(prepareLevelOne(body.sourceJson));
    return NextResponse.json(prepareLevelTwo(body.sourceJson));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el horario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
