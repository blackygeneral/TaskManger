FROM python:3.14-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN DEBUG=true TESTING=true python manage.py collectstatic --noinput
RUN useradd --create-home taskflow && mkdir -p /app/staticfiles && chown -R taskflow:taskflow /app
USER taskflow
EXPOSE 8000
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "config.asgi:application"]
