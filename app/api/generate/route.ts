import { NextResponse } from "next/server";
import {
  prepareLevelOne,
  readLevelOneInput,
} from "../../../src/application/scheduling/prepare-level-one";
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
    const level = body.level === undefined ? 1 : body.level;
    if (level !== 0 && level !== 1) {
      return NextResponse.json({ error: "El nivel debe ser 0 o 1." }, { status: 400 });
    }
    if (body.validateOnly === true) {
      if (level === 0) readLevelZeroCourses(body.sourceJson);
      else readLevelOneInput(body.sourceJson);
      return NextResponse.json({ valid: true });
    }
    return NextResponse.json(
      level === 0
        ? { level, ...prepareLevelZero(body.sourceJson) }
        : prepareLevelOne(body.sourceJson),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo generar el horario.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
