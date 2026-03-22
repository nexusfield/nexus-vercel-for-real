import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center nexus-app">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-xl font-medium">Sign in to Nexus</h1>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
