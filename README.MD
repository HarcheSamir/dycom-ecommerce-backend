

### **Procedure : Updating the Backend**

**Objective:** Pull the latest backend code, install any new packages, run database migrations, and restart the application with zero downtime.

**[ON YOUR VPS]**

1.  **Navigate to the Backend Directory:**
    ```bash
    cd ~/ecommerce-insights-backend
    ```

2.  **Pull the Latest Code from GitHub:**
    This command fetches the changes you pushed from your local machine.
    ```bash
    git pull origin main
    ```

3.  **Install/Update Dependencies:**
    This is a critical step. If you added or updated any packages in `package.json`, this command will install them. It's safe to run even if nothing changed.
    ```bash
    npm install
    ```

4.  **Run Database Migrations:**
    **This is the most important step.** If you made any changes to your `prisma/schema.prisma` file, this command will safely apply those changes to your live database. If you made no schema changes, this command will do nothing. **It is a best practice to run it on every deploy.**
    ```bash
    npx prisma migrate deploy
    ```

5.  **Build the New TypeScript Code:**
    You must re-compile your `.ts` files into the `.js` files that the server runs.
    ```bash
    npm run build
    ```

6.  **Restart the Application via PM2:**
    PM2 will perform a zero-downtime restart, loading your new code.
    ```bash
    pm2 restart ecommerce-backend
    ```

7.  **Verify the Update:**
    Check the status and logs to ensure the application restarted correctly.
    ```bash
    pm2 list
    # The 'uptime' for ecommerce-backend should have reset to a few seconds.

    pm2 logs ecommerce-backend
    # Check for any new errors on startup.
    ```

