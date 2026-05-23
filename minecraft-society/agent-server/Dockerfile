FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY agent_server.py .
EXPOSE 7432
CMD ["uvicorn", "agent_server:app", "--host", "0.0.0.0", "--port", "7432"]
