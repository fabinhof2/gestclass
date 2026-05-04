import PageHeader from "@/components/ui/page-header";
import StudentForm from "@/components/ui/student-form";
import SimpleDataTable from "@/components/ui/simple-data-table";

const studentRows = [
  {
    col1: "Ana Clara Martins",
    col2: "8º Ano A",
    col3: "Juliana Martins",
    col4: "Ativo",
  },
  {
    col1: "Pedro Henrique Souza",
    col2: "7º Ano B",
    col3: "Carlos Souza",
    col4: "Ativo",
  },
  {
    col1: "Lucas Gabriel Rocha",
    col2: "6º Ano C",
    col3: "Patrícia Rocha",
    col4: "Em atenção",
  },
];

export default function CadastroAlunoPage() {
  return (
    <section>
      <PageHeader
        title="Cadastro de Alunos"
        description="Cadastre alunos e acompanhe a listagem básica da escola."
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <StudentForm />

        <SimpleDataTable
          title="Alunos cadastrados"
          col1Label="Aluno"
          col2Label="Turma"
          col3Label="Responsável"
          col4Label="Status"
          rows={studentRows}
          actionLabel="Visualizar"
        />
      </div>
    </section>
  );
}