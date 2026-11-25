import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as expected
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).with_name("fixtures")
BASE_URL = os.environ.get("SCHEDULE_BASE_URL", "http://localhost:3000")
OWNER = "Usuario de prueba 1"
PARTICIPANT = "Usuario de prueba 2"


def find_brave():
    configured = os.environ.get("BRAVE_BINARY")
    if configured:
        if not Path(configured).is_file():
            raise RuntimeError("BRAVE_BINARY debe apuntar al ejecutable de Brave.")
        return configured

    if os.name == "nt":
        for key in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"]:
            if folder := os.environ.get(key):
                candidate = Path(folder) / "BraveSoftware/Brave-Browser/Application/brave.exe"
                if candidate.is_file():
                    return str(candidate)

    if executable := shutil.which("brave"):
        return executable
    raise RuntimeError("No se encontró Brave. Define BRAVE_BINARY con la ruta de su ejecutable.")


def query_database(sql):
    result = subprocess.run(
        [
            "docker", "compose", "exec", "-T", "db", "psql",
            "-U", "complex_schedule", "-d", "complex_schedule",
            "-v", "ON_ERROR_STOP=1", "-qAt", "-c", sql,
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        encoding="utf-8",
        timeout=20,
    )
    return result.stdout.strip()


class HorariosSelenium(unittest.TestCase):
    use_brave = False

    @classmethod
    def setUpClass(cls):
        cls.files = Path(cls.enterClassContext(tempfile.TemporaryDirectory()))
        cls.downloads = cls.files / "downloads"
        cls.downloads.mkdir()
        options = Options()
        if cls.use_brave:
            options.binary_location = find_brave()
        else:
            options.add_argument("--headless=new")
        options.add_argument("--window-size=1440,1050")
        options.add_experimental_option("prefs", {
            "download.default_directory": str(cls.downloads),
            "download.prompt_for_download": False,
        })
        os.environ.setdefault("SE_AVOID_STATS", "true")
        driver_path = os.environ.get("CHROMEDRIVER_PATH")
        cls.browser = webdriver.Chrome(service=Service(driver_path), options=options)
        cls.addClassCleanup(cls.browser.quit)
        cls.wait = WebDriverWait(cls.browser, 15)

    def setUp(self):
        self.browser.get(BASE_URL)
        title = self.wait.until(expected.visibility_of_element_located(
            (By.CSS_SELECTOR, ".auth-intro h1")
        ))
        self.assertEqual(" ".join(title.text.split()), "Arma tu horario del semestre")

    def heading(self, title):
        return self.wait.until(expected.visibility_of_element_located(
            (By.XPATH, f'//h1[normalize-space(.)="{title}"]')
        ))

    def click(self, label, scope="//main"):
        locator = (By.XPATH, f'{scope}//button[normalize-space(.)="{label}"]')
        self.wait.until(expected.element_to_be_clickable(locator)).click()

    def enter_as(self, name):
        locator = (By.XPATH, f'//button[.//strong[normalize-space(.)="{name}"]]')
        self.wait.until(
            expected.element_to_be_clickable(locator),
            f"No apareció el perfil {name} en {BASE_URL}. Comprueba que Next sirva la interfaz y que /api/users tenga perfiles de prueba.",
        ).click()
        self.wait.until(expected.visibility_of_element_located((By.CSS_SELECTOR, ".home")))

    def open_upload(self):
        self.click("Subir JSON", "//nav")
        self.heading("Subir JSON")

    def upload(self, path):
        self.browser.find_element(By.CSS_SELECTOR, "input[type=file]").send_keys(str(path))

    def wait_valid(self):
        self.wait.until(expected.text_to_be_present_in_element(
            (By.CSS_SELECTOR, ".success-card"), "Archivo válido"
        ))

    def generate(self, count):
        self.click("Ejecutar algoritmo")
        self.heading("Horarios generados")
        self.assertEqual(
            [item.text for item in self.browser.find_elements(By.CSS_SELECTOR, ".metric strong")],
            ["7", str(count)],
        )
        self.assertEqual(len(self.browser.find_elements(By.CSS_SELECTOR, ".schedule-card")), count)

    def download(self, label, filename):
        path = self.downloads / filename
        path.unlink(missing_ok=True)
        self.click(label)
        self.wait.until(lambda _: path.is_file() and path.stat().st_size > 0)
        return path.read_text(encoding="utf-8")

    def test_ejemplo_genera_dos_opciones(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.click("Usar JSON de ejemplo")
        self.wait_valid()
        self.generate(2)
        criteria = self.browser.find_element(By.CSS_SELECTOR, ".criteria").text
        self.assertIn("Mínimo de 8 créditos", criteria)
        self.assertIn("Máximo de 11 créditos", criteria)
        self.assertIn("Almuerzo libre de 13:00 a 14:00", criteria)
        self.assertIn("Días libres · Sábado", criteria)
        self.assertEqual(
            [badge.text for badge in self.browser.find_elements(By.CSS_SELECTOR, ".credit-pill")],
            ["11 créditos totales", "11 créditos totales"],
        )
        self.browser.find_elements(By.CSS_SELECTOR, ".schedule-card")[0].find_element(
            By.XPATH, './/button[normalize-space(.)="Ver calendario"]'
        ).click()
        self.heading("Horario 1")
        self.assertEqual(len(self.browser.find_elements(By.CSS_SELECTOR, ".lunch-window")), 6)
        titles = [session.get_attribute("title") for session in self.browser.find_elements(
            By.CSS_SELECTOR, ".timetable .class-block"
        )]
        self.assertIn("Ingeniería de software · Grupo SOF-02 · 14:00–16:00", titles)
        self.assertFalse(any("SOF-01" in title for title in titles))

    def test_informa_un_rango_valido_sin_horarios(self):
        self.enter_as(OWNER)
        self.open_upload()
        source = json.loads((FIXTURES / "prioridades.json").read_text(encoding="utf-8"))
        source["estudiante"].update({"creditosMin": 8, "creditosMax": 9})
        path = self.files / "minimo-inalcanzable.json"
        path.write_text(json.dumps(source), encoding="utf-8")
        self.upload(path)
        self.wait_valid()
        self.generate(0)
        notice = self.browser.find_element(By.CSS_SELECTOR, "main .footnote")
        self.assertIn("8 a 9 créditos", notice.text)

    def test_descuenta_el_almuerzo_al_aplicar_cero_huecos(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "huecos.json")
        self.wait_valid()
        self.generate(1)
        self.assertIn("Sin huecos", self.browser.find_element(By.CSS_SELECTOR, ".criteria").text)
        self.click("Ver calendario")
        self.heading("Horario 1")
        sessions = self.browser.find_elements(By.CSS_SELECTOR, ".timetable .class-block")
        self.assertEqual([item.get_attribute("title") for item in sessions], [
            "Algoritmos · Grupo A1 · 12:00–13:00",
            "Estadística · Grupo B1 · 14:00–15:00",
        ])

    def test_filtra_grupos_fuera_de_la_franja_y_muestra_los_extremos(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "franja.json")
        self.wait_valid()
        self.generate(1)
        criteria = self.browser.find_element(By.CSS_SELECTOR, ".criteria").text
        self.assertIn("Franja preferida de 08:00 a 16:00", criteria)
        self.click("Ver calendario")
        self.heading("Horario 1")
        sessions = self.browser.find_elements(By.CSS_SELECTOR, ".timetable .class-block")
        self.assertEqual([item.get_attribute("title") for item in sessions], [
            "Algoritmos · Grupo A1 · 08:00–09:00",
            "Estadística · Grupo B1 · 15:00–16:00",
        ])

    def test_excluye_grupo_lleno_y_muestra_sesiones_contiguas(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "contiguos-con-grupo-lleno.json")
        self.wait_valid()
        self.generate(1)
        self.click("Ver calendario")
        self.heading("Horario 1")

        sessions = self.browser.find_elements(By.CSS_SELECTOR, ".timetable .class-block")
        self.assertEqual([session.get_attribute("title") for session in sessions], [
            "Algoritmos · Grupo A-01 · 08:00–09:00",
            "Estadística · Grupo B-01 · 09:00–10:30",
        ])
        result = json.loads(self.download("Descargar JSON", "Horario 1.json"))
        self.assertEqual([course["sectionId"] for course in result["courses"]], ["A-01", "B-01"])
        text = self.download("Descargar TXT", "Horario 1.txt")
        self.assertIn("Estadística · Grupo B-01", text)
        self.assertIn("Lunes 09:00–10:30", text)

    def test_muestra_cero_opciones_si_faltan_cupos_o_se_cruzan_dos_altas(self):
        self.enter_as(OWNER)
        conflict = json.loads((FIXTURES / "cruce-inevitable.json").read_text(encoding="utf-8"))
        conflict["estudiante"]["materias"][1]["prioridad"] = "alta"
        two_required = self.files / "altas-cruzadas.json"
        two_required.write_text(json.dumps(conflict), encoding="utf-8")
        for path, reason in [
            (FIXTURES / "sin-cupos.json", "Materia alta A: sin grupos con cupos"),
            (two_required, "No se encontró un horario"),
        ]:
            with self.subTest(filename=path.name):
                self.open_upload()
                self.upload(path)
                self.wait_valid()
                self.generate(0)
                notice = self.browser.find_element(By.CSS_SELECTOR, "main .footnote")
                self.assertIn(reason, notice.text)

    def test_muestra_y_exporta_las_omisiones_de_un_horario_parcial(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "cruce-inevitable.json")
        self.wait_valid()
        self.generate(1)
        self.assertIn("Estadística", self.browser.find_element(By.CSS_SELECTOR, ".omitted").text)
        self.click("Ver calendario")
        self.heading("Horario 1")
        self.assertEqual(len(self.browser.find_elements(By.CSS_SELECTOR, ".class-block")), 1)
        result = json.loads(self.download("Descargar JSON", "Horario 1.json"))
        self.assertEqual([course["sectionId"] for course in result["courses"]], ["A-01"])
        self.assertEqual(result["totalCredits"], 4)
        self.assertEqual(result["omitted"][0]["courseId"], "B")
        text = self.download("Descargar TXT", "Horario 1.txt")
        self.assertIn("Nivel 7 · 4 créditos totales", text)
        self.assertIn("Materias omitidas", text)
        self.assertIn("Estadística (hay grupos elegibles que se cruzan", text)

    def test_rechaza_archivos_invalidos_y_permite_corregirlos(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "contiguos-con-grupo-lleno.json")
        self.wait_valid()

        malformed = self.files / "incompleto.json"
        malformed.write_text('{"catalogo":', encoding="utf-8")
        invalid_priority = self.files / "prioridad-invalida.json"
        source = json.loads((FIXTURES / "prioridades.json").read_text(encoding="utf-8"))
        source["estudiante"]["materias"][0]["prioridad"] = "urgente"
        invalid_priority.write_text(json.dumps(source), encoding="utf-8")
        invalid_range = self.files / "rango-invertido.json"
        source["estudiante"]["materias"][0]["prioridad"] = "alta"
        source["estudiante"]["creditosMin"] = 8
        invalid_range.write_text(json.dumps(source), encoding="utf-8")
        for path, error in [
            (malformed, "no contiene JSON válido"),
            (FIXTURES / "cupos-invalidos.json", "cuposDisponibles"),
            (invalid_priority, "prioridad de la materia A"),
            (invalid_range, "creditosMin debe ser menor o igual"),
        ]:
            with self.subTest(filename=path.name):
                self.upload(path)
                self.wait.until(expected.text_to_be_present_in_element(
                    (By.CSS_SELECTOR, "[role=alert]"), error
                ))
                generate = self.browser.find_element(
                    By.XPATH, '//main//button[normalize-space(.)="Ejecutar algoritmo"]'
                )
                self.assertFalse(generate.is_enabled())

        self.upload(FIXTURES / "contiguos-con-grupo-lleno.json")
        self.wait_valid()
        self.generate(1)

    def test_prefiere_la_media_y_reabre_el_horario_con_dos_participantes(self):
        suffix = uuid4().hex
        user_id = f"selenium-{suffix}"
        extra_participant = f"Participante Selenium {suffix[:8]}"
        title = f"Prueba Selenium {suffix}"
        self.addCleanup(
            query_database,
            f"DELETE FROM user_schedule WHERE title = '{title}' AND created_by_user_id = 'demo-user-1';"
            f"DELETE FROM app_user WHERE user_id = '{user_id}';",
        )
        query_database(
            "INSERT INTO app_user (user_id, full_name, email) VALUES "
            f"('{user_id}', '{extra_participant}', '{user_id}@example.invalid');"
        )
        self.browser.refresh()
        self.enter_as(OWNER)
        self.open_upload()
        source_file = FIXTURES / "prioridades.json"
        self.upload(source_file)
        self.wait_valid()

        for name in [PARTICIPANT, extra_participant]:
            label = self.browser.find_element(
                By.XPATH, f'//fieldset[contains(@class, "participant-picker")]//label[normalize-space(.)="{name}"]'
            )
            label.click()
            self.assertTrue(label.find_element(By.CSS_SELECTOR, "input").is_selected())
        self.browser.find_element(
            By.XPATH, '//label[span[contains(., "Nombre para guardar")]]//input'
        ).send_keys(title)
        self.generate(1)
        self.assertIn("Bases de datos", self.browser.find_element(By.CSS_SELECTOR, ".omitted").text)
        self.assertIn("máximo de créditos", self.browser.find_element(By.CSS_SELECTOR, ".omitted").text)
        self.click("Guardar")
        self.wait.until(expected.visibility_of_element_located(
            (By.XPATH, '//main//button[normalize-space(.)="Guardado"]')
        ))

        stored_source = query_database(f"SELECT source_json FROM user_schedule WHERE title = '{title}';")
        self.assertEqual(json.loads(stored_source), json.loads(source_file.read_text(encoding="utf-8")))

        for name in [OWNER, PARTICIPANT, extra_participant]:
            with self.subTest(user=name):
                self.browser.refresh()
                self.enter_as(name)
                self.click("Guardados", "//nav")
                self.heading("Mis horarios guardados")
                scope = f'//article[.//h2[normalize-space(.)="{title}"]]'
                card = self.wait.until(expected.visibility_of_element_located((By.XPATH, scope)))
                self.assertIn("Nivel alcanzado: 7", card.text)
                self.assertIn(PARTICIPANT, card.text)
                self.assertIn(extra_participant, card.text)
                self.click("Abrir calendario", scope)
                self.heading(title)
                sessions = self.browser.find_elements(By.CSS_SELECTOR, ".class-block")
                self.assertEqual([session.get_attribute("title") for session in sessions], [
                    "Algoritmos · Grupo A-01 · 08:00–09:00",
                    "Estadística · Grupo M-01 · 09:00–10:00",
                ])
                self.assertIn("Bases de datos", self.browser.find_element(By.CSS_SELECTOR, ".omitted").text)

    def test_ordena_por_profesores_y_muestra_el_docente(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "profesores.json")
        self.wait_valid()
        self.generate(3)
        self.assertIn("Profesores preferidos", self.browser.find_element(By.CSS_SELECTOR, ".criteria").text)
        self.click("Ver calendario", '(//main//article[contains(@class, "schedule-card")])[1]')
        self.heading("Horario 1")
        self.assertIn("Ana Pérez", self.browser.find_element(By.CSS_SELECTOR, ".class-block").text)


if __name__ == "__main__":
    if "--brave" in sys.argv:
        sys.argv.remove("--brave")
        HorariosSelenium.use_brave = True
    unittest.main()
