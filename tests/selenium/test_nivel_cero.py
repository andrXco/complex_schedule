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


class NivelCeroSelenium(unittest.TestCase):
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
            ["0", str(count)],
        )
        self.assertEqual(len(self.browser.find_elements(By.CSS_SELECTOR, ".schedule-card")), count)

    def download(self, label, filename):
        self.click(label)
        path = self.downloads / filename
        self.wait.until(lambda _: path.is_file() and path.stat().st_size > 0)
        return path.read_text(encoding="utf-8")

    def test_ejemplo_genera_dos_opciones(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.click("Usar JSON de ejemplo")
        self.wait_valid()
        self.generate(2)

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

    def test_muestra_cero_opciones_si_hay_cruce_o_faltan_cupos(self):
        self.enter_as(OWNER)
        for filename in ["cruce-inevitable.json", "sin-cupos.json"]:
            with self.subTest(filename=filename):
                self.open_upload()
                self.upload(FIXTURES / filename)
                self.wait_valid()
                self.generate(0)
                notice = self.browser.find_element(By.CSS_SELECTOR, "main .footnote")
                self.assertIn("No se encontró una combinación", notice.text)

    def test_rechaza_archivos_invalidos_y_permite_corregirlos(self):
        self.enter_as(OWNER)
        self.open_upload()
        self.upload(FIXTURES / "contiguos-con-grupo-lleno.json")
        self.wait_valid()

        malformed = self.files / "incompleto.json"
        malformed.write_text('{"catalogo":', encoding="utf-8")
        for path, error in [
            (malformed, "no contiene JSON válido"),
            (FIXTURES / "cupos-invalidos.json", "cuposDisponibles"),
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

    def test_guarda_y_reabre_un_horario_con_dos_participantes(self):
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
        source_file = FIXTURES / "contiguos-con-grupo-lleno.json"
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
                self.assertIn("Nivel alcanzado: 0", card.text)
                self.assertIn(PARTICIPANT, card.text)
                self.assertIn(extra_participant, card.text)
                self.click("Abrir calendario", scope)
                self.heading(title)
                self.assertEqual(len(self.browser.find_elements(By.CSS_SELECTOR, ".class-block")), 2)


if __name__ == "__main__":
    if "--brave" in sys.argv:
        sys.argv.remove("--brave")
        NivelCeroSelenium.use_brave = True
    unittest.main()
