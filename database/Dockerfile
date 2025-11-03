FROM postgres:16

# Set environment variables
ENV POSTGRES_USER=quinnjh
ENV POSTGRES_PASSWORD=quinn
ENV POSTGRES_DB=shelfdata

# Copy the database dump for initialization
COPY shelfdata.dump /tmp/

# Create initialization script that will restore the dump and configure authentication
RUN echo '#!/bin/bash' > /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'set -e' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'echo "Restoring database from dump..."' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v /tmp/shelfdata.dump' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'echo "Database restoration completed."' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'echo "Configuring authentication..."' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    echo 'echo "local all all md5" >> "$PGDATA/pg_hba.conf"' >> /docker-entrypoint-initdb.d/01-restore.sh && \
    chmod +x /docker-entrypoint-initdb.d/01-restore.sh