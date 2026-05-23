##
## Minecraft AI Manager — Deployment Commands
## Run `make help` for a list of all commands.
##

SHELL       := /bin/bash
DEPLOY_DIR  := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
ENV_FILE    := $(DEPLOY_DIR).env
COMPOSE     := docker compose --env-file $(ENV_FILE) -f $(DEPLOY_DIR)docker-compose.yml

# Load .env so make targets can reference variables (e.g. POSTGRES_USER)
-include $(ENV_FILE)
export

.PHONY: help setup deploy update stop restart status logs \
        rollback backup restore shell-api shell-db shell-mcp shell-minecraft \
        logs-api logs-web logs-db logs-mcp logs-minecraft \
        build-plugins deploy-plugins seed-admin nuke

## ─────────────────────────────────────────────────────────────────────────────
## GETTING STARTED
## ─────────────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@echo ""
	@echo "  Minecraft AI Manager — Deployment Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

setup: ## FIRST TIME: run the interactive setup wizard → generates .env
	@bash $(DEPLOY_DIR)scripts/setup.sh

## ─────────────────────────────────────────────────────────────────────────────
## DEPLOY & UPDATE
## ─────────────────────────────────────────────────────────────────────────────

deploy: ## Build images, run migrations, start all services
	@bash $(DEPLOY_DIR)scripts/deploy.sh

update: ## Pull latest code, then redeploy (same as git pull + make deploy)
	@git -C $(DEPLOY_DIR)/.. pull --ff-only
	@bash $(DEPLOY_DIR)scripts/deploy.sh

rollback: ## Revert to the previous deployed version
	@bash $(DEPLOY_DIR)scripts/rollback.sh

## ─────────────────────────────────────────────────────────────────────────────
## SERVICE CONTROL
## ─────────────────────────────────────────────────────────────────────────────

stop: ## Stop all containers (data is preserved)
	$(COMPOSE) down

restart: ## Restart all containers without rebuilding
	$(COMPOSE) restart

status: ## Show status of all running containers
	$(COMPOSE) ps

logs: ## Tail logs from all containers (Ctrl+C to exit)
	$(COMPOSE) logs -f

logs-api: ## Tail only the API logs
	$(COMPOSE) logs -f api

logs-web: ## Tail only the Nginx/web logs
	$(COMPOSE) logs -f web

logs-db: ## Tail only the database logs
	$(COMPOSE) logs -f db

logs-mcp: ## Tail only the MCP server logs
	$(COMPOSE) logs -f mcp

logs-minecraft: ## Tail only the Minecraft server logs
	$(COMPOSE) logs -f minecraft

## ─────────────────────────────────────────────────────────────────────────────
## DATABASE
## ─────────────────────────────────────────────────────────────────────────────

backup: ## Backup the database to deploymentV2/backups/
	@bash $(DEPLOY_DIR)scripts/backup.sh

restore: ## Restore database from a backup file (use: make restore BACKUP=path/to/file.sql.gz)
	@bash $(DEPLOY_DIR)scripts/restore.sh

migrate: ## Run pending database migrations manually
	$(COMPOSE) exec api npx prisma migrate deploy

seed-admin: ## Create the first SUPER_ADMIN account (prompts for email/password)
	$(COMPOSE) exec api node -e "\
	  const {PrismaClient} = require('@prisma/client'); \
	  const bcrypt = require('bcryptjs'); \
	  const prisma = new PrismaClient(); \
	  const readline = require('readline'); \
	  const rl = readline.createInterface({input:process.stdin,output:process.stdout}); \
	  rl.question('Admin email: ', email => rl.question('Password: ', async pass => { \
	    const hash = await bcrypt.hash(pass,12); \
	    await prisma.user.upsert({where:{email},update:{role:'SUPER_ADMIN',passwordHash:hash},create:{email,passwordHash:hash,role:'SUPER_ADMIN'}}); \
	    console.log('Admin account ready.'); rl.close(); await prisma.\$$disconnect(); \
	  }));"

## ─────────────────────────────────────────────────────────────────────────────
## SHELL ACCESS
## ─────────────────────────────────────────────────────────────────────────────

shell-api: ## Open a shell inside the API container
	$(COMPOSE) exec api sh

shell-db: ## Open a psql shell inside the database container
	$(COMPOSE) exec db psql -U $(POSTGRES_USER) $(POSTGRES_DB)

shell-redis: ## Open a redis-cli shell
	$(COMPOSE) exec redis redis-cli -a $(REDIS_PASSWORD)

shell-mcp: ## Open a shell inside the MCP server container
	$(COMPOSE) exec mcp sh

shell-minecraft: ## Open a shell inside the Minecraft container
	$(COMPOSE) exec minecraft bash

## ─────────────────────────────────────────────────────────────────────────────
## MINECRAFT PLUGINS
## ─────────────────────────────────────────────────────────────────────────────

build-plugins: ## Compile all Java plugins with Maven
	mvn -f $(DEPLOY_DIR)../plugins/pom.xml clean package -DskipTests -q
	@echo "  ✓ Plugin JARs built in plugins/*/target/"

deploy-plugins: build-plugins ## Build plugins + rebuild and restart the Minecraft container
	@echo "  ▶ Staging JARs into jars/..."
	@find $(DEPLOY_DIR)../plugins -name '*-*.jar' -path '*/target/*' \
	  ! -name '*-sources.jar' ! -name '*-javadoc.jar' \
	  -exec cp {} $(DEPLOY_DIR)../jars/ \;
	@echo "  ✓ JARs staged"
	@echo "  ▶ Rebuilding Minecraft container..."
	$(COMPOSE) build minecraft
	$(COMPOSE) up -d minecraft
	@echo "  ✓ Minecraft container updated with new plugins"

## ─────────────────────────────────────────────────────────────────────────────
## DANGER ZONE
## ─────────────────────────────────────────────────────────────────────────────

nuke: ## ⚠ DESTROY everything — stops containers AND deletes all data volumes
	@echo ""
	@echo "  ⚠  WARNING: This will permanently delete the database and all volumes."
	@read -r -p "  Type 'DELETE EVERYTHING' to confirm: " confirm; \
	  [ "$$confirm" = "DELETE EVERYTHING" ] || (echo "  Aborted." && exit 1)
	$(COMPOSE) down -v --remove-orphans
	@echo "  ✓ All containers and volumes removed."
