## 📢 Commit and push changes from the athensarea-content submodule
public-publish:
	@echo "📦 Staging all changes in $(CURDIR)..."
	git add .
	git status
	@read -p '✍️ Enter commit message: ' msg; \
	git commit -m "$$msg" && git push
	@echo "✅ Changes pushed from public/ to origin."
