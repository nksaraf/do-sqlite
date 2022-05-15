// import Sqlite, { Param } from "@rkusa/wasm-sqlite";

import type { Param } from "@rkusa/wasm-sqlite";

interface Env {
  DATABASE: DurableObjectNamespace;
}

export class Database {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async execute(sqlite, sql, params) {
    let errorMsg = [];
    try {
      console.error = (msg) => {
        // console.log("HERE", msg);
        errorMsg.push(msg);
      };
      await sqlite.execute(sql, params);
    } catch (e) {
      throw new Error([e.message + "\n", ...errorMsg].join(""));
    }
  }

  async queryRaw(sqlite, sql, params) {
    let errorMsg = [];
    try {
      console.error = (msg) => {
        // console.log("HERE", msg);
        errorMsg.push(msg);
      };
      return await sqlite.queryRaw(sql, params);
    } catch (e) {
      throw new Error([e.message + "\n", ...errorMsg].join(""));
    }
  }

  async fetch(req: Request) {
    console.log(req.url);
    if (req.method !== "POST") {
      return new Response("only POST requests are allowed", {
        status: 405 /* method not allowed */,
      });
    }

    const url = new URL(req.url);
    let isQuery = false;
    if (url.pathname === "/query") {
      isQuery = true;
    }

    console.log(url.pathname, url.searchParams.get("ix"));

    // instantiate SQLite and plug it into the DO's storage
    const storage = this.state.storage;

    let getPage = async (ix: number) => {
      const page: Array<number> =
        (await storage.get<Array<number>>(String(ix))) ?? new Array(4096);
      return new Uint8Array(page);
    };

    if (url.pathname.startsWith("/get-page")) {
      console.log("hetting page", Number(url.searchParams.get("ix")));
      return new Response(await getPage(Number(url.searchParams.get("ix"))));
    }

    let putPage = async (ix: number, page: Uint8Array) => {
      await storage.put(String(ix), Array.from(page), {});
    };

    if (url.pathname.startsWith("/set-page")) {
      console.log("hetting page", Number(url.searchParams.get("ix")));
      await putPage(
        Number(url.searchParams.get("ix")),
        new Uint8Array(await req.arrayBuffer())
      );
      return new Response(null);
    }

    let query: { sql: string; params: Array<Param> };
    if (req.headers.get("content-type")?.includes("form")) {
      let formData = await req.formData();
      query = { sql: formData.get("sql") as string, params: [] };
      if (formData.get("method") === "query") {
        isQuery = true;
      }
    } else {
      // parse body
      query = await req.json();
    }
    console.log(query, isQuery);

    if (!query || typeof query !== "object") {
      return new Response("expected body to be an object", {
        status: 400 /* bad request */,
      });
    }

    // validate sql property
    if (typeof query?.sql !== "string") {
      return new Response("expected `body.sql` to be a string", {
        status: 400 /* bad request */,
      });
    }

    // validate params property
    if (
      query?.params &&
      (!Array.isArray(query?.params) ||
        query.params.find(
          (p) =>
            !(
              p === null ||
              typeof p === "string" ||
              typeof p === "number" ||
              typeof p === "boolean"
            )
        ))
    ) {
      return new Response(
        "expected `body.params` to be an array of `string | number | boolean | null`",
        {
          status: 400 /* bad request */,
        }
      );
    }

    // const sqlite = await Sqlite.instantiate(getPage, putPage);

    // if (isQuery) {
    //   try {
    //     let json = await this.queryRaw(sqlite, query.sql, query.params);
    //     return new Response(json, {
    //       headers: {
    //         "content-type": "application/json; charset=utf-8",
    //       },
    //     });
    //   } catch (e) {
    //     return new Response(JSON.stringify({ error: e.message }), {
    //       status: 500 /* internal server error */,
    //       headers: {
    //         "content-type": "application/json",
    //       },
    //     });
    //   }
    // } else {
    //   let stmts = query.sql
    //     .split(";")
    //     .map((a) => a.trim())
    //     .filter((a) => a.length > 0);
    //   try {
    //     for (let stmt of stmts) {
    //       await this.execute(sqlite, stmt, query.params);
    //     }
    //     return new Response(null, {
    //       status: 204 /* no content */,
    //     });
    //   } catch (e) {
    //     return new Response(JSON.stringify({ error: e.message }), {
    //       status: 500 /* internal server error */,
    //       headers: {
    //         "content-type": "application/json",
    //       },
    //     });
    //   }
    // }
  }
}

export default {
  async fetch(req: Request, env: Env) {
    if (req.method === "GET") {
      let html = await fetch(
        "https://gist.githubusercontent.com/nksaraf/62e7c180412386bcf02f2fc457cd70d1/raw/0cf904aeafa7f363ed70aedebfc4abedd84de316/index.html"
      );
      return new Response(await html.text(), {
        // status: 405 /* method not allowed */,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(null, { status: 405 }); // method not allowed
    }

    // Expected pattern: /:database/{query,execute}
    const url = new URL(req.url);
    const segments = url.pathname.slice(1).split("/");
    console.log(segments.length);
    if (segments.length < 1) {
      return new Response("not found", {
        status: 404 /* not found */,
      });
    }
    const [name, path] = segments;

    const id = env.DATABASE.idFromName(name);
    const stub = env.DATABASE.get(id);
    return stub.fetch(
      `http://sqlite/${path}?ix=${url.searchParams.get("ix")}`,
      {
        method: "POST",
        headers: req.headers,
        body: req.body,
      }
    );
  },
};

/*

CREATE TABLE vals (id INTEGER PRIMARY KEY AUTOINCREMENT, val VARCHAR NOT NULL);
INSERT INTO vals (val) VALUES (1);

SELECT * FROM vals

*/
