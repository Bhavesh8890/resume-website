
import yaml
import os
import subprocess
import tempfile
from datetime import date

# Minimal valid RenderCV YAML structure
# We'll use a known good minimal example to see if CL generation works
test_yaml = """
cv:
  name: "John Doe"
  location: "Test City"
  email: "test@example.com"
  phone: "+1 234 567 8900"
  education:
    - institution: "Test University"
      area: "Computer Science"
      degree: "BS"
      start_date: "2020-01"
      end_date: "2024-01"
  sections:
    test_section:
      - "Test item"

design:
  theme: "classic"
"""

def test_render():
    data = yaml.safe_load(test_yaml)
    
    # Inject text
    data["cv"]["cover_letter"] = {
        "recipient": "Hiring Manager",
        "content": "This is a test cover letter content.",
        "date": date.today().strftime("%Y-%m-%d")
    }
    
    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = os.path.join(temp_dir, "test_input.yaml")
        with open(input_path, "w") as f:
            yaml.dump(data, f)
            
        print(f"Running rendercv in {temp_dir}...")
        rendercv_bin = os.path.abspath("backend/venv/bin/rendercv")
        try:
            result = subprocess.run(
                [rendercv_bin, "render", input_path],
                cwd=temp_dir,
                capture_output=True,
                text=True
            )
            print("--- STDOUT ---")
            print(result.stdout)
            print("--- STDERR ---")
            print(result.stderr)
            
            output_dir = os.path.join(temp_dir, "rendercv_output")
            if os.path.exists(output_dir):
                files = os.listdir(output_dir)
                print(f"Generated Files: {files}")
            else:
                print("Output directory not found!")
                
        except Exception as e:
            print(f"Execution Error: {e}")

if __name__ == "__main__":
    test_render()
