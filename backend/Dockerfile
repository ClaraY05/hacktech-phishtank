# 1. Use the official Playwright Python image
# This automatically handles all the complex OS-level dependencies required for Chromium
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy

# 2. Set environment variables to optimize Python inside Docker
# PYTHONUNBUFFERED: Forces Python to print logs immediately (critical for seeing worker output)
# PYTHONDONTWRITEBYTECODE: Stops Python from writing useless .pyc files in the container
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# 3. Create a non-root user for security
RUN useradd -m pwuser

# 4. Set the working directory inside the container
WORKDIR /home/pwuser/app

# 5. Copy your build configuration files first
# We do this before copying the code to leverage Docker's layer caching.
# If you only change your python code, Docker won't have to re-download all your pip packages.
COPY pyproject.toml README.md ./

# 6. Copy the actual source code folder
COPY src/ ./src/

# 7. Install your project and its dependencies exactly as defined in pyproject.toml
RUN pip install --no-cache-dir .

# 8. Transfer ownership of the files to your secure user
RUN chown -R pwuser:pwuser /home/pwuser/app

# 9. Switch to the non-root user to run the application
USER pwuser

# 10. The default command when the container spins up
# This assumes your worker.py is set up to be run as a module
ENTRYPOINT ["python", "-m", "ai_safe_link_backend.worker"]