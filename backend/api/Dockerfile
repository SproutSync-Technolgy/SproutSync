FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
COPY alembic.ini ./
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN pip install --no-cache-dir . && useradd --create-home sproutsync
RUN chmod +x docker-entrypoint.sh
USER sproutsync
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
