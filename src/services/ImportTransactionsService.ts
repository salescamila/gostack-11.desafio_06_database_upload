import { getCustomRepository, getRepository, In, Long } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionRepository = getCustomRepository(TransactionRepository);
    const categoriesRepository = getRepository(Category);

    const contactReadStream = fs.createReadStream(filePath);

    // Indica que irá ler a partir da linha 2
    const parsers = csvParse({
      from_line: 2,
    });

    const parseCSV = contactReadStream.pipe(parsers);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    // Lendo cada linha do arquivo e inserindo no array correspondente
    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);

      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    // Recupera todas as categorias existentes na base de dados
    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    // Filtra quais categorias lidas do arquivo já existem na base de dados
    const existentCategoriesTitles = existentCategories.map(
      (category: Category) => category.title,
    );

    // Filtra quais categorias deverão ser criadas na base de dados
    const addCategoryTitles = categories.filter(
      category => !existentCategoriesTitles.includes(category),
    ).filter((value, index, self) => self.indexOf(value) == index);

    // Mapeia novas categorias e cria o objeto a ser inserido na base de dados
    const newCategories = categoriesRepository.create(
      addCategoryTitles.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);
  }
}

export default ImportTransactionsService;
